import ast
import logging
import time
from collections import deque
from typing import Any

import pandas as pd

from app.models.pipeline import ExecutionResult, PipelinePlan, PipelineStep, StepLog, VizSpec
from app.services.viz import build_chart

logger = logging.getLogger(__name__)


def _build_graph(
    plan: PipelinePlan,
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, int]]:
    parents: dict[str, list[str]] = {s.id: [] for s in plan.steps}
    children: dict[str, list[str]] = {s.id: [] for s in plan.steps}
    in_degree: dict[str, int] = {s.id: 0 for s in plan.steps}

    for edge in plan.edges:
        if edge.source in children and edge.target in parents:
            children[edge.source].append(edge.target)
            parents[edge.target].append(edge.source)
            in_degree[edge.target] += 1

    return parents, children, in_degree


def _resolve_input(
    step_id: str,
    parents: dict[str, list[str]],
    outputs: dict[str, pd.DataFrame],
    source_df: pd.DataFrame,
) -> pd.DataFrame:
    step_parents = parents.get(step_id, [])

    if len(step_parents) == 0:
        return source_df.copy()
    if len(step_parents) == 1:
        return outputs[step_parents[0]].copy()
    raise ValueError(
        f"Step '{step_id}' has {len(step_parents)} parents; multi-input merge is not supported"
    )


def _select_preview_sink(
    plan: PipelinePlan,
    step_map: dict[str, PipelineStep],
    parents: dict[str, list[str]],
    children: dict[str, list[str]],
    outputs: dict[str, pd.DataFrame],
) -> tuple[pd.DataFrame, str]:
    sink_ids = [sid for sid in step_map if not children.get(sid)]

    if not sink_ids:
        last_id = plan.steps[-1].id
        return outputs[last_id], last_id

    def output_for_sink(sink_id: str) -> pd.DataFrame:
        step = step_map[sink_id]
        if step.type == "visualize" and parents.get(sink_id):
            return outputs[parents[sink_id][0]]
        return outputs[sink_id]

    non_viz_sinks = [sid for sid in sink_ids if step_map[sid].type != "visualize"]
    candidates = non_viz_sinks if non_viz_sinks else sink_ids

    best_id = max(candidates, key=lambda sid: len(output_for_sink(sid)))
    return output_for_sink(best_id), best_id


def _is_dag(plan: PipelinePlan) -> bool:
    """Return False when the edge graph contains a cycle."""
    _, _, in_degree = _build_graph(plan)
    adjacency: dict[str, list[str]] = {s.id: [] for s in plan.steps}
    for edge in plan.edges:
        if edge.source in adjacency and edge.target in in_degree:
            adjacency[edge.source].append(edge.target)

    queue = deque([sid for sid, deg in in_degree.items() if deg == 0])
    visited = 0

    while queue:
        node = queue.popleft()
        visited += 1
        for neighbor in adjacency.get(node, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return visited == len(plan.steps)


def _topological_order(plan: PipelinePlan) -> list[str]:
    if not plan.edges:
        return [s.id for s in plan.steps]

    in_degree: dict[str, int] = {s.id: 0 for s in plan.steps}
    adjacency: dict[str, list[str]] = {s.id: [] for s in plan.steps}

    for edge in plan.edges:
        if edge.source in adjacency and edge.target in in_degree:
            adjacency[edge.source].append(edge.target)
            in_degree[edge.target] += 1

    queue = deque([sid for sid, deg in in_degree.items() if deg == 0])
    order: list[str] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for neighbor in adjacency.get(node, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(order) != len(plan.steps):
        return [s.id for s in plan.steps]
    return order


def _apply_filter(df: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
    col = params["column"]
    op = params.get("op", "eq")
    value = params.get("value")

    if op == "eq":
        return df[df[col] == value]
    if op == "neq":
        return df[df[col] != value]
    if op == "gt":
        return df[df[col] > value]
    if op == "gte":
        return df[df[col] >= value]
    if op == "lt":
        return df[df[col] < value]
    if op == "lte":
        return df[df[col] <= value]
    if op == "contains":
        return df[df[col].astype(str).str.contains(str(value), na=False)]
    if op == "is_null":
        return df[df[col].isna()]
    if op == "not_null":
        return df[df[col].notna()]
    if op == "between":
        if isinstance(value, (list, tuple)) and len(value) == 2:
            return df[(df[col] >= value[0]) & (df[col] <= value[1])]
        raise ValueError(f"Value for 'between' operator must be a list/tuple of 2 elements, got {value}")
    raise ValueError(f"Unknown filter operator: {op}")


def _normalize_aggregations(aggregations: Any) -> dict[str, tuple[str, str]]:
    """Normalize aggregations to {output_name: (source_column, func)}.

    Handles three formats the LLM may produce:
      1. Simple:   {"gross_revenue": "sum"}
         -> output=gross_revenue, source=gross_revenue
      2. Extended: {"total_revenue": {"column": "gross_revenue", "func": "sum"}}
         -> output=total_revenue, source=gross_revenue
      3. List:     [{"column": "gross_revenue", "func": "sum", "alias": "total_revenue"}]
         -> output=total_revenue, source=gross_revenue
    """
    if isinstance(aggregations, list):
        result: dict[str, tuple[str, str]] = {}
        for item in aggregations:
            if not isinstance(item, dict):
                continue
            col = item.get("column") or item.get("col", "")
            func = item.get("function") or item.get("func") or item.get("agg", "sum")
            alias = item.get("alias") or item.get("as") or col
            result[alias] = (col, func)
        return result

    if isinstance(aggregations, dict):
        result = {}
        for output_name, spec in aggregations.items():
            if isinstance(spec, dict):
                # Extended format: {"total_revenue": {"column": "gross_revenue", "func": "sum"}}
                col = spec.get("column") or spec.get("col") or output_name
                func = spec.get("func") or spec.get("function") or spec.get("agg", "sum")
            else:
                # Simple format: {"gross_revenue": "sum"} — output name IS the source column
                col = output_name
                func = str(spec)
            result[output_name] = (col, func)
        return result
    return {}



def _apply_groupby_agg(df: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
    group_by = params.get("group_by") or []
    agg_map = _normalize_aggregations(params.get("aggregations", {}))

    if not agg_map:
        if group_by:
            return df.groupby(group_by, as_index=False).size()
        return df

    if not group_by:
        row = {name: df[col].agg(func) for name, (col, func) in agg_map.items()}
        return pd.DataFrame([row])

    named = {
        name: pd.NamedAgg(column=col, aggfunc=func)
        for name, (col, func) in agg_map.items()
    }
    return df.groupby(group_by, as_index=False).agg(**named)


# ---------------------------------------------------------------------------
# Restricted expression evaluator for compute_column
# ---------------------------------------------------------------------------

#: AST node types that are unconditionally permitted in expressions.
_ALLOWED_NODES: frozenset[type] = frozenset({
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.BoolOp,
    ast.Name,
    ast.Constant,
    ast.Load,
    # Operators
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.USub, ast.UAdd,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    ast.And, ast.Or,
})

#: Node types that are explicitly forbidden (belt-and-suspenders — the
#: allowlist already rejects everything not in _ALLOWED_NODES, but naming
#: these makes the intent clear in error messages).
_BLOCKED_NODES: frozenset[type] = frozenset({
    ast.Attribute,
    ast.Call,
    ast.Subscript,
    ast.Lambda,
    ast.Import,
    ast.ImportFrom,
})


def _safe_eval_expression(df: pd.DataFrame, expr: str) -> "pd.Series":
    """Parse and evaluate *expr* against DataFrame columns in a restricted sandbox.

    Only arithmetic, comparison, and boolean operations referencing existing
    column names are permitted.  Any attempt to use attribute access, function
    calls, subscripting, lambdas, or imports raises ``ValueError`` — this
    eliminates the ``engine='python'`` attribute-chain RCE vector entirely at
    the parse stage, before any Python code runs.

    Parameters
    ----------
    df:
        The source DataFrame; column names define the only allowed ``Name``
        nodes in the expression.
    expr:
        An arithmetic / comparison expression string, e.g.
        ``"(revenue - cost) / revenue"``.

    Returns
    -------
    pd.Series
        The evaluated result, suitable for assignment as a new column.

    Raises
    ------
    ValueError
        If *expr* contains disallowed constructs or names not in ``df.columns``.
    SyntaxError
        If *expr* cannot be parsed as a Python expression.
    """
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid expression syntax: {exc}") from exc

    column_names: frozenset[str] = frozenset(df.columns.astype(str))

    for node in ast.walk(tree):
        node_type = type(node)
        if node_type in _BLOCKED_NODES:
            raise ValueError(
                f"Disallowed construct in expression: {node_type.__name__!r} is not permitted"
            )
        if node_type not in _ALLOWED_NODES:
            raise ValueError(
                f"Disallowed construct in expression: {node_type.__name__!r} is not permitted"
            )
        if node_type is ast.Name:
            if node.id not in column_names:  # type: ignore[attr-defined]
                raise ValueError(f"Unknown column: {node.id!r}")  # type: ignore[attr-defined]

    # Belt-and-suspenders: run with an empty builtins namespace and only
    # column Series in locals.  The AST walk above already guarantees safety,
    # but this defence-in-depth prevents builtins from leaking even if a
    # future node type is inadvertently added to the allowlist.
    local_ns = {col: df[col] for col in df.columns.astype(str)}
    compiled = compile(tree, filename="<expression>", mode="eval")
    return eval(compiled, {"__builtins__": {}}, local_ns)  # noqa: S307


def _apply_step(df: pd.DataFrame, step_type: str, params: dict[str, Any]) -> pd.DataFrame:
    if step_type == "filter":
        return _apply_filter(df, params)
    if step_type == "select_columns":
        return df[params["columns"]]
    if step_type == "rename":
        return df.rename(columns=params.get("mapping", {}))
    if step_type == "fill_na":
        value = params.get("value", 0)
        columns = params.get("columns")
        if columns:
            result = df.copy()
            result[columns] = result[columns].fillna(value)
            return result
        return df.fillna(value)
    if step_type == "cast_type":
        col = params["column"]
        dtype = params.get("dtype", "str")
        result = df.copy()
        if dtype in ("int", "float"):
            result[col] = pd.to_numeric(result[col], errors="coerce")
        elif dtype == "str":
            result[col] = result[col].astype(str)
        elif dtype == "datetime":
            result[col] = pd.to_datetime(result[col], errors="coerce")
        return result
    if step_type == "groupby_agg":
        return _apply_groupby_agg(df, params)
    if step_type == "sort":
        return df.sort_values(
            by=params.get("columns", [df.columns[0]]),
            ascending=params.get("ascending", True),
        )
    if step_type == "deduplicate":
        subset = params.get("subset")
        return df.drop_duplicates(subset=subset)
    if step_type == "compute_column":
        col_name = params["name"]
        expr = params["expression"]
        result = df.copy()
        result[col_name] = _safe_eval_expression(result, expr)
        return result
    if step_type == "visualize":
        return df
    raise ValueError(f"Unknown step type: {step_type}")


def _run_step(
    step: PipelineStep,
    input_df: pd.DataFrame,
    viz_specs: list[VizSpec],
) -> tuple[pd.DataFrame, str]:
    if step.type == "visualize":
        figure = build_chart(input_df, step.params)
        viz_specs.append(
            VizSpec(
                step_id=step.id,
                chart_type=step.params.get("chart_type", "bar"),
                title=step.label,
                figure=figure,
            )
        )
        return input_df, f"Generated {step.params.get('chart_type', 'bar')} chart"
    return _apply_step(input_df, step.type, step.params), f"Applied {step.type}"


def execute_pipeline(df: pd.DataFrame, plan: PipelinePlan) -> ExecutionResult:
    logger.info(
        "[executor] START pipeline=%r steps=%d edges=%d input_rows=%d input_cols=%d",
        plan.name, len(plan.steps), len(plan.edges), len(df), len(df.columns),
    )
    step_map = {s.id: s for s in plan.steps}
    parents, children, _ = _build_graph(plan)
    order = _topological_order(plan)
    use_linear_fallback = not _is_dag(plan)
    if use_linear_fallback:
        logger.warning("[executor] pipeline=%r is NOT a DAG — using linear fallback order", plan.name)
    else:
        logger.info("[executor] topological order: %s", order)
    outputs: dict[str, pd.DataFrame] = {}
    logs: list[StepLog] = []
    viz_specs: list[VizSpec] = []
    current = df.copy()

    for step_id in order:
        step = step_map.get(step_id)
        if not step:
            logger.warning("[executor] step_id=%s not found in step_map — skipping", step_id)
            continue

        if use_linear_fallback:
            input_df = current
        else:
            input_df = _resolve_input(step_id, parents, outputs, df)

        rows_in = len(input_df)
        logger.info(
            "[executor] STEP start | id=%s type=%s label=%r rows_in=%d",
            step.id, step.type, step.label, rows_in,
        )
        start = time.perf_counter()

        try:
            result_df, message = _run_step(step, input_df, viz_specs)
            outputs[step_id] = result_df
            if use_linear_fallback:
                current = result_df
        except Exception as e:
            logger.error(
                "[executor] STEP FAILED | id=%s type=%s label=%r error=%s",
                step.id, step.type, step.label, e, exc_info=True,
            )
            raise ValueError(f"Step '{step.label}' ({step_id}): {e}") from e

        duration_ms = (time.perf_counter() - start) * 1000
        rows_out = len(outputs[step_id])
        logger.info(
            "[executor] STEP done  | id=%s type=%s rows_out=%d duration_ms=%.1f msg=%r",
            step.id, step.type, rows_out, duration_ms, message,
        )
        logs.append(
            StepLog(
                step_id=step.id,
                step_type=step.type,
                label=step.label,
                rows_in=rows_in,
                rows_out=rows_out,
                duration_ms=round(duration_ms, 2),
                message=message,
            )
        )

    preview_df, preview_step_id = _select_preview_sink(
        plan, step_map, parents, children, outputs
    )
    logger.info(
        "[executor] DONE pipeline=%r preview_step=%s preview_rows=%d viz_specs=%d",
        plan.name, preview_step_id, len(preview_df), len(viz_specs),
    )
    preview = preview_df.head(50).where(pd.notna(preview_df.head(50)), None).to_dict(
        orient="records"
    )
    return ExecutionResult(
        preview=preview,
        columns=list(preview_df.columns.astype(str)),
        row_count=len(preview_df),
        viz_specs=viz_specs,
        execution_log=logs,
        preview_step_id=preview_step_id,
    )
