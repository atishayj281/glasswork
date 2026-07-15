import time
from collections import deque
from typing import Any

import pandas as pd

from app.models.pipeline import ExecutionResult, PipelinePlan, StepLog, VizSpec
from app.services.viz import build_chart


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


def execute_pipeline(df: pd.DataFrame, plan: PipelinePlan) -> ExecutionResult:
    step_map = {s.id: s for s in plan.steps}
    order = _topological_order(plan)
    current = df.copy()
    logs: list[StepLog] = []
    viz_specs: list[VizSpec] = []

    for step_id in order:
        step = step_map.get(step_id)
        if not step:
            continue

        rows_in = len(current)
        start = time.perf_counter()

        if step.type == "visualize":
            figure = build_chart(current, step.params)
            viz_specs.append(
                VizSpec(
                    step_id=step.id,
                    chart_type=step.params.get("chart_type", "bar"),
                    title=step.label,
                    figure=figure,
                )
            )
            message = f"Generated {step.params.get('chart_type', 'bar')} chart"
        else:
            current = _apply_step(current, step.type, step.params)
            message = f"Applied {step.type}"

        duration_ms = (time.perf_counter() - start) * 1000
        logs.append(
            StepLog(
                step_id=step.id,
                step_type=step.type,
                label=step.label,
                rows_in=rows_in,
                rows_out=len(current),
                duration_ms=round(duration_ms, 2),
                message=message,
            )
        )

    preview = current.head(50).where(pd.notna(current.head(50)), None).to_dict(orient="records")
    return ExecutionResult(
        preview=preview,
        columns=list(current.columns.astype(str)),
        row_count=len(current),
        viz_specs=viz_specs,
        execution_log=logs,
    )
