"""Normalize LLM pipeline output before Pydantic validation."""

from typing import Any


def _normalize_aggregations(aggregations: Any) -> dict[str, Any]:
    if isinstance(aggregations, list):
        result: dict[str, Any] = {}
        for item in aggregations:
            if not isinstance(item, dict):
                continue
            col = item.get("column") or item.get("col", "")
            func = item.get("function") or item.get("func") or item.get("agg", "sum")
            alias = item.get("alias") or item.get("as") or col
            if col and col != alias:
                # Extended: preserve the source mapping as a dict for the executor
                result[alias] = {"column": col, "func": func}
            else:
                result[alias] = func
        return result
    if isinstance(aggregations, dict):
        # Already correct — pass through (handles both simple and extended dict-of-dicts)
        return {str(k): v for k, v in aggregations.items()}
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


def _linearize_fanin(data: dict[str, Any]) -> dict[str, Any]:
    """Repair fan-in merges the LLM generates (multiple parents -> one child).

    When all parents of a multi-parent node are the same step type (e.g. all
    compute_column), we can safely chain them linearly rather than merging them:
        [p1, p2, p3] -> child   becomes   p1 -> p2 -> p3 -> child

    This preserves every transformation without requiring merge support.
    For truly heterogeneous parents we leave the topology intact and let the
    executor raise a descriptive error.
    """
    steps: list[dict] = data.get("steps", [])
    edges: list[dict] = data.get("edges", [])

    if not isinstance(steps, list) or not isinstance(edges, list):
        return data

    # Build parent map: target -> [sources]
    parents: dict[str, list[str]] = {s["id"]: [] for s in steps if isinstance(s, dict)}
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        src, tgt = edge.get("source"), edge.get("target")
        if src and tgt and tgt in parents:
            parents[tgt].append(src)

    step_type: dict[str, str] = {
        s["id"]: s.get("type", "") for s in steps if isinstance(s, dict)
    }

    new_edges = list(edges)

    for child_id, parent_ids in parents.items():
        if len(parent_ids) <= 1:
            continue

        # Only auto-repair when all parents share the same type (common LLM mistake)
        parent_types = {step_type.get(p, "") for p in parent_ids}
        if len(parent_types) != 1:
            continue  # heterogeneous fan-in — leave for executor to report

        # Remove all original edges that point to this child
        new_edges = [
            e for e in new_edges
            if not (isinstance(e, dict) and e.get("target") == child_id and e.get("source") in parent_ids)
        ]

        # Chain the parents sequentially: p[0] -> p[1] -> ... -> p[n-1] -> child
        for i in range(len(parent_ids) - 1):
            new_edges.append({"source": parent_ids[i], "target": parent_ids[i + 1]})
        new_edges.append({"source": parent_ids[-1], "target": child_id})

    return {**data, "edges": new_edges}


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

    # Repair fan-in topology after step params are normalised
    result = _linearize_fanin(result)
    return result
