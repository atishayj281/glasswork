"""Tests for fork-aware DAG pipeline execution."""

import pandas as pd
import pytest

from app.models.pipeline import PipelineEdge, PipelinePlan, PipelineStep
from app.services.executor import (
    _apply_step,
    _build_graph,
    _resolve_input,
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
