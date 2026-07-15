"""Normalize LLM pipeline output before Pydantic validation."""

from typing import Any


def _normalize_aggregations(aggregations: Any) -> dict[str, str]:
    if isinstance(aggregations, list):
        result: dict[str, str] = {}
        for item in aggregations:
            if not isinstance(item, dict):
                continue
            col = item.get("column") or item.get("col", "")
            func = item.get("function") or item.get("func") or item.get("agg", "sum")
            if col:
                result[col] = func
        return result
    if isinstance(aggregations, dict):
        return {str(k): str(v) for k, v in aggregations.items()}
    return {}


def _normalize_step_params(step_type: str, params: Any) -> dict[str, Any]:
    if not isinstance(params, dict):
        return {}

    normalized = dict(params)

    if step_type == "groupby_agg":
        if "aggregations" in normalized:
            normalized["aggregations"] = _normalize_aggregations(normalized["aggregations"])
        if normalized.get("group_by") is None:
            normalized["group_by"] = []

    return normalized


def normalize_pipeline_data(data: dict[str, Any]) -> dict[str, Any]:
    """Fix common LLM mistakes before validation."""
    result = dict(data)
    steps = result.get("steps", [])
    if isinstance(steps, list):
        result["steps"] = [
            {
                **step,
                "params": _normalize_step_params(
                    step.get("type", ""),
                    step.get("params", {}),
                ),
            }
            if isinstance(step, dict)
            else step
            for step in steps
        ]
    return result
