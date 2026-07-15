import time
from collections import deque
from typing import Any

import pandas as pd

from app.models.pipeline import ExecutionResult, PipelinePlan, PipelineStep, StepLog, VizSpec
from app.services.viz import build_chart


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
    raise ValueError(f"Unknown filter operator: {op}")


def _normalize_aggregations(aggregations: Any) -> dict[str, tuple[str, str]]:
    """Normalize aggregations to {output_name: (source_column, func)}."""
    if isinstance(aggregations, list):
        result: dict[str, tuple[str, str]] = {}
        for item in aggregations:
            if not isinstance(item, dict):
                continue
            col = item.get("column") or item.get("col", "")
            func = item.get("function") or item.get("func") or item.get("agg", "sum")
            alias = item.get("alias") or col
            result[alias] = (col, func)
        return result

    if isinstance(aggregations, dict):
        return {col: (col, func) for col, func in aggregations.items()}
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
        result[col_name] = result.eval(expr, engine="python")
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
    step_map = {s.id: s for s in plan.steps}
    parents, children, _ = _build_graph(plan)
    order = _topological_order(plan)
    use_linear_fallback = not _is_dag(plan)
    outputs: dict[str, pd.DataFrame] = {}
    logs: list[StepLog] = []
    viz_specs: list[VizSpec] = []
    current = df.copy()

    for step_id in order:
        step = step_map.get(step_id)
        if not step:
            continue

        if use_linear_fallback:
            input_df = current
        else:
            input_df = _resolve_input(step_id, parents, outputs, df)

        rows_in = len(input_df)
        start = time.perf_counter()

        try:
            result_df, message = _run_step(step, input_df, viz_specs)
            outputs[step_id] = result_df
            if use_linear_fallback:
                current = result_df
        except Exception as e:
            raise ValueError(f"Step '{step.label}' ({step_id}): {e}") from e

        duration_ms = (time.perf_counter() - start) * 1000
        logs.append(
            StepLog(
                step_id=step.id,
                step_type=step.type,
                label=step.label,
                rows_in=rows_in,
                rows_out=len(outputs[step_id]),
                duration_ms=round(duration_ms, 2),
                message=message,
            )
        )

    preview_df, preview_step_id = _select_preview_sink(
        plan, step_map, parents, children, outputs
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
