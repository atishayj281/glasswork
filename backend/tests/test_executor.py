"""Tests for fork-aware DAG pipeline execution."""

import pandas as pd
import pytest

from app.models.pipeline import PipelineEdge, PipelinePlan, PipelineStep
from app.services.executor import (
    _apply_step,
    _build_graph,
    _resolve_input,
    _safe_eval_expression,
    _topological_order,
    execute_pipeline,
)


def _sample_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "order_date": [
                "2024-01-15",
                "2024-02-10",
                "2024-03-20",
                "2024-04-05",
                "2024-01-25",
                "2024-02-28",
            ],
            "order_status": [
                "completed",
                "completed",
                "completed",
                "pending",
                "completed",
                "completed",
            ],
            "region": ["North", "South", "East", "West", "North", "South"],
            "product_category": ["A", "B", "A", "B", "A", "B"],
            "gross_revenue": [100.0, 200.0, 150.0, 80.0, 120.0, 90.0],
            "shipping_cost": [10.0, 20.0, 15.0, 8.0, 12.0, 9.0],
        }
    )


def _run_to_outputs(df: pd.DataFrame, plan: PipelinePlan) -> dict[str, pd.DataFrame]:
    step_map = {s.id: s for s in plan.steps}
    parents, _, _ = _build_graph(plan)
    order = _topological_order(plan)
    outputs: dict[str, pd.DataFrame] = {}

    for step_id in order:
        step = step_map[step_id]
        input_df = _resolve_input(step_id, parents, outputs, df)
        if step.type == "visualize":
            outputs[step_id] = input_df
        else:
            outputs[step_id] = _apply_step(input_df, step.type, step.params)

    return outputs


def _linear_plan() -> PipelinePlan:
    return PipelinePlan(
        name="Linear",
        steps=[
            PipelineStep(
                id="f1",
                type="filter",
                label="Completed only",
                params={"column": "order_status", "op": "eq", "value": "completed"},
            ),
            PipelineStep(
                id="g1",
                type="groupby_agg",
                label="By region",
                params={
                    "group_by": ["region"],
                    "aggregations": {"gross_revenue": "sum"},
                },
            ),
        ],
        edges=[PipelineEdge(source="f1", target="g1")],
    )


def _fork_plan() -> PipelinePlan:
    """Mirrors the Q1 demo fork: shared prep then region vs daily branches."""
    return PipelinePlan(
        name="Fork",
        steps=[
            PipelineStep(
                id="s1",
                type="cast_type",
                label="Cast date",
                params={"column": "order_date", "dtype": "datetime"},
            ),
            PipelineStep(
                id="s2",
                type="filter",
                label="Completed",
                params={"column": "order_status", "op": "eq", "value": "completed"},
            ),
            PipelineStep(
                id="s5",
                type="compute_column",
                label="Profit margin",
                params={
                    "name": "profit_margin",
                    "expression": "(gross_revenue - shipping_cost) / gross_revenue",
                },
            ),
            PipelineStep(
                id="s7",
                type="groupby_agg",
                label="By region and category",
                params={
                    "group_by": ["region", "product_category"],
                    "aggregations": {"gross_revenue": "sum", "profit_margin": "mean"},
                },
            ),
            PipelineStep(
                id="v1",
                type="visualize",
                label="Region bar",
                params={
                    "chart_type": "bar",
                    "x": "region",
                    "y": "gross_revenue",
                    "title": "Revenue by region",
                },
            ),
            PipelineStep(
                id="s9",
                type="groupby_agg",
                label="Daily revenue",
                params={
                    "group_by": ["order_date"],
                    "aggregations": {"gross_revenue": "sum"},
                },
            ),
            PipelineStep(
                id="v3",
                type="visualize",
                label="Daily trend",
                params={
                    "chart_type": "line",
                    "x": "order_date",
                    "y": "gross_revenue",
                    "title": "Daily revenue",
                },
            ),
        ],
        edges=[
            PipelineEdge(source="s1", target="s2"),
            PipelineEdge(source="s2", target="s5"),
            PipelineEdge(source="s5", target="s7"),
            PipelineEdge(source="s7", target="v1"),
            PipelineEdge(source="s5", target="s9"),
            PipelineEdge(source="s9", target="v3"),
        ],
    )


def _multi_parent_plan() -> PipelinePlan:
    return PipelinePlan(
        name="Merge attempt",
        steps=[
            PipelineStep(
                id="a",
                type="filter",
                label="Branch A",
                params={"column": "region", "op": "eq", "value": "North"},
            ),
            PipelineStep(
                id="b",
                type="filter",
                label="Branch B",
                params={"column": "region", "op": "eq", "value": "South"},
            ),
            PipelineStep(
                id="c",
                type="sort",
                label="Merge target",
                params={"columns": ["gross_revenue"], "ascending": False},
            ),
        ],
        edges=[
            PipelineEdge(source="a", target="c"),
            PipelineEdge(source="b", target="c"),
        ],
    )


def _cycle_plan() -> PipelinePlan:
    return PipelinePlan(
        name="Cycle fallback",
        steps=[
            PipelineStep(
                id="s1",
                type="filter",
                label="Step 1",
                params={"column": "order_status", "op": "eq", "value": "completed"},
            ),
            PipelineStep(
                id="s2",
                type="sort",
                label="Step 2",
                params={"columns": ["gross_revenue"], "ascending": False},
            ),
        ],
        edges=[
            PipelineEdge(source="s1", target="s2"),
            PipelineEdge(source="s2", target="s1"),
        ],
    )


def test_linear_pipeline():
    result = execute_pipeline(_sample_df(), _linear_plan())

    assert result.row_count == 3
    assert "region" in result.columns
    assert "gross_revenue" in result.columns
    assert result.preview_step_id == "g1"
    assert len(result.execution_log) == 2


def test_fork_pipeline_both_branches_succeed():
    df = _sample_df()
    plan = _fork_plan()
    result = execute_pipeline(df, plan)
    outputs = _run_to_outputs(df, plan)

    assert len(result.execution_log) == 7
    assert len(result.viz_specs) == 2

    s7_log = next(log for log in result.execution_log if log.step_id == "s7")
    s9_log = next(log for log in result.execution_log if log.step_id == "s9")

    assert s7_log.rows_out > 0
    assert s9_log.rows_out > 0
    assert "region" in outputs["s7"].columns
    assert "order_date" in outputs["s9"].columns
    assert result.preview_step_id in {"s9", "s7", "v1", "v3"}


def test_multi_parent_raises():
    with pytest.raises(ValueError, match="multi-input merge is not supported"):
        execute_pipeline(_sample_df(), _multi_parent_plan())


def test_cycle_fallback_still_runs():
    result = execute_pipeline(_sample_df(), _cycle_plan())
    assert len(result.execution_log) == 2
    assert result.row_count > 0


def test_step_error_includes_context():
    plan = PipelinePlan(
        name="Bad column",
        steps=[
            PipelineStep(
                id="g1",
                type="groupby_agg",
                label="Bad groupby",
                params={
                    "group_by": ["missing_col"],
                    "aggregations": {"gross_revenue": "sum"},
                },
            ),
        ],
        edges=[],
    )

    with pytest.raises(ValueError, match="Step 'Bad groupby' \\(g1\\)"):
        execute_pipeline(_sample_df(), plan)


# ---------------------------------------------------------------------------
# _safe_eval_expression — security tests
# ---------------------------------------------------------------------------

class TestSafeEvalExpression:
    """Verify that _safe_eval_expression is both correct and attack-resistant."""

    def _df(self) -> pd.DataFrame:
        """Minimal DataFrame for expression evaluation tests."""
        return pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [4.0, 5.0, 6.0]})

    def _revenue_df(self) -> pd.DataFrame:
        return pd.DataFrame({"revenue": [100.0, 200.0, 300.0]})

    # ------------------------------------------------------------------
    # Legitimate expressions — must compute correctly
    # ------------------------------------------------------------------

    def test_simple_multiply(self):
        df = self._revenue_df()
        result = _safe_eval_expression(df, "revenue * 1.1")
        expected = pd.Series([110.0, 220.0, 330.0], name="revenue")
        pd.testing.assert_series_equal(result, expected, check_names=False)

    def test_arithmetic_with_two_columns(self):
        df = self._df()
        result = _safe_eval_expression(df, "a + b")
        pd.testing.assert_series_equal(result, pd.Series([5.0, 7.0, 9.0]), check_names=False)

    def test_parenthesized_expression(self):
        """Regression: the fork-pipeline uses (a - b) / a."""
        df = self._df()
        result = _safe_eval_expression(df, "(a - b) / a")
        assert len(result) == 3
        # (1-4)/1 = -3, (2-5)/2 = -1.5, (3-6)/3 = -1.0
        assert abs(result.iloc[0] - (-3.0)) < 1e-9
        assert abs(result.iloc[2] - (-1.0)) < 1e-9

    def test_comparison_expression(self):
        df = self._df()
        result = _safe_eval_expression(df, "a > b")
        assert list(result) == [False, False, False]

    def test_floor_div_mod_pow(self):
        df = self._df()
        _safe_eval_expression(df, "a ** 2")  # must not raise
        _safe_eval_expression(df, "b // a")
        _safe_eval_expression(df, "b % a")

    def test_unary_minus(self):
        df = self._df()
        result = _safe_eval_expression(df, "-a")
        assert list(result) == [-1.0, -2.0, -3.0]

    def test_regression_compute_column_in_pipeline(self):
        """The existing fork plan's compute_column step must still work end-to-end."""
        result = execute_pipeline(_sample_df(), _fork_plan())
        # profit_margin column is produced in step s5
        s5_log = next(log for log in result.execution_log if log.step_id == "s5")
        assert s5_log.rows_out > 0

    # ------------------------------------------------------------------
    # Malicious expressions — must raise ValueError, no internal leakage
    # ------------------------------------------------------------------

    def _assert_blocked(self, expr: str, *, df: pd.DataFrame | None = None) -> None:
        """Assert that expr raises ValueError and the message is safe."""
        _df = df if df is not None else self._df()
        with pytest.raises(ValueError) as exc_info:
            _safe_eval_expression(_df, expr)
        msg = str(exc_info.value)
        # The error must NOT expose internal Python object representations.
        for leak_marker in ("<class", "<built", "__subclasses__", "object at 0x", "<module"):
            assert leak_marker not in msg, (
                f"Error message leaks internal repr for {expr!r}: {msg!r}"
            )

    def test_blocks_attribute_access(self):
        """a.__class__ must be rejected at the AST-walk stage."""
        self._assert_blocked("a.__class__")

    def test_blocks_dunder_chain_rce_vector(self):
        """Classic sandbox-escape chain must be blocked."""
        self._assert_blocked(
            "a.values.__class__.__base__.__subclasses__()"
        )

    def test_blocks_function_call_builtin(self):
        """sum(a) must be blocked — Call node is disallowed."""
        self._assert_blocked("sum(a)")

    def test_blocks_function_call_on_series(self):
        """a.tolist() must be blocked — both Attribute and Call."""
        self._assert_blocked("a.tolist()")

    def test_blocks_subscript(self):
        """a[0] must be blocked — Subscript node is disallowed."""
        self._assert_blocked("a[0]")

    def test_blocks_lambda(self):
        """lambda x: x must be blocked."""
        self._assert_blocked("(lambda x: x)(a)")

    def test_blocks_unknown_name(self):
        """Names not in df.columns must raise ValueError."""
        df = self._df()  # has columns 'a' and 'b' only
        with pytest.raises(ValueError, match="Unknown column"):
            _safe_eval_expression(df, "revenue * 1.1")

    def test_blocks_globals_builtins_access(self):
        """__builtins__ or __import__ referenced directly must be blocked
        because neither 'builtins' nor '__import__' exists in df.columns."""
        self._assert_blocked("__builtins__")
        self._assert_blocked("__import__")

    def test_error_message_names_construct(self):
        """The ValueError for a blocked node must name the construct."""
        df = self._df()
        with pytest.raises(ValueError, match="'Attribute'"):
            _safe_eval_expression(df, "a.__class__")
        with pytest.raises(ValueError, match="'Call'"):
            _safe_eval_expression(df, "sum(a)")
        with pytest.raises(ValueError, match="'Subscript'"):
            _safe_eval_expression(df, "a[0]")

    def test_additional_adversarial_expressions(self):
        df = self._df()
        # 1. Walrus assignment: (x := 1)
        with pytest.raises(ValueError, match="NamedExpr"):
            _safe_eval_expression(df, "(x := 1)")

        # 2. Comprehension: [c for c in ()]
        with pytest.raises(ValueError, match="ListComp"):
            _safe_eval_expression(df, "[c for c in ()]")

        # 3. f-string: f'{1}'
        with pytest.raises(ValueError, match="JoinedStr|FormattedValue"):
            _safe_eval_expression(df, "f'{1}'")

        # 4. Chained comparison: 1 == 1 == 1 (decide and assert: allowed and safe)
        result = _safe_eval_expression(df, "1 == 1 == 1")
        assert result is True or (isinstance(result, pd.Series) and result.iloc[0] is True)

        # 5. Column name colliding with builtin: e.g. column literally named "len"
        df_colliding = pd.DataFrame({"len": [10, 20, 30], "sum": [1, 2, 3]})
        # Direct reference should resolve to the series, not the builtin
        res_len = _safe_eval_expression(df_colliding, "len")
        pd.testing.assert_series_equal(res_len, df_colliding["len"])

        res_sum = _safe_eval_expression(df_colliding, "sum + 5")
        pd.testing.assert_series_equal(res_sum, pd.Series([6, 7, 8]), check_names=False)

        # And calling them must still be blocked at AST parse stage as 'Call'
        with pytest.raises(ValueError, match="'Call'"):
            _safe_eval_expression(df_colliding, "len(sum)")
