import json
import logging
import re
from typing import Any, AsyncGenerator

import litellm

from app.config import LITELLM_MODEL
from app.models.pipeline import PipelinePlan, TypedPipelinePlan
from app.models.schema import DatasetProfile
from app.services.pipeline_normalizer import normalize_pipeline_data
from app.services.session import SessionState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a data analysis assistant for the Aegis platform.

CRITICAL RULES:
- You NEVER see raw row data. You only know column names, data types, null percentages, and row counts.
- Ask clarifying questions when the user's intent is ambiguous.
- When suggesting analysis, reference columns by exact name from the dataset profile.
- Keep responses concise and actionable.
- When the user is ready for analysis, tell them to click "Generate Pipeline" to create a visual pipeline.
"""


OUTPUT_FORMAT = """
OUTPUT FORMAT (mandatory):
Return ONLY valid JSON. No markdown fences. No explanation text.

{
  "name": "string",
  "steps": [
    {
      "id": "string",
      "type": "filter | select_columns | rename | fill_na | cast_type | groupby_agg | sort | deduplicate | compute_column | visualize",
      "label": "string",
      "params": { <type-specific fields> },
      "position": { "x": number, "y": number }
    }
  ],
  "edges": [{ "source": "step_id", "target": "step_id" }]
}
"""


PLAN_SYSTEM_PROMPT = """You are a data pipeline architect. Generate a JSON pipeline plan.

RULES:
- Use ONLY column names from the provided dataset profile.
- Include a 'visualize' step when the user wants insights or charts.
- Each step needs: id, type, label, params, position (x, y spaced by 250).
- Edges connect steps in execution order.
- Forking is supported: one parent step may connect to multiple children (shared prep, then parallel branches).
- Do NOT create steps with multiple incoming edges (multi-input merge is not supported).
- When forking, each branch should end in its own visualize step.

STEP PARAM SCHEMAS (follow exactly):

filter:
  { "column": "status", "op": "eq", "value": "active" }
  ops: eq, neq, gt, gte, lt, lte, contains, is_null, not_null

groupby_agg:
  { "group_by": ["region"], "aggregations": { "revenue": "sum", "orders": "count" } }
  aggregations MUST be a dict mapping column -> function (sum, count, mean, min, max).
  group_by MUST be a list of column names (use one column for single-group summaries).

sort:
  { "columns": ["revenue"], "ascending": false }

visualize:
  { "chart_type": "bar", "x": "region", "y": "revenue", "title": "Revenue by Region" }
  chart types: bar, line, scatter, pie, histogram, heatmap

select_columns: { "columns": ["region", "revenue"] }
rename: { "mapping": { "old_name": "new_name" } }
fill_na: { "columns": ["revenue"], "value": 0 }
cast_type: { "column": "date", "dtype": "datetime" }
deduplicate: { "subset": ["region", "date"] }
compute_column: { "name": "tax", "expression": "revenue * 0.1" }

EXAMPLE:
{
  "name": "Revenue by Region",
  "steps": [
    { "id": "f1", "type": "filter", "label": "Active only",
      "params": { "column": "status", "op": "eq", "value": "active" },
      "position": { "x": 0, "y": 0 } },
    { "id": "g1", "type": "groupby_agg", "label": "Sum by region",
      "params": { "group_by": ["region"], "aggregations": { "revenue": "sum" } },
      "position": { "x": 250, "y": 0 } },
    { "id": "v1", "type": "visualize", "label": "Bar chart",
      "params": { "chart_type": "bar", "x": "region", "y": "revenue", "title": "Revenue by Region" },
      "position": { "x": 500, "y": 0 } }
  ],
  "edges": [
    { "source": "f1", "target": "g1" },
    { "source": "g1", "target": "v1" }
  ]
}
""" + OUTPUT_FORMAT


def _profile_context(profile: DatasetProfile) -> str:
    cols = "\n".join(
        f"  - {c.name} ({c.dtype}, {c.null_pct}% null)"
        for c in profile.columns
    )
    lines = [
        f"Dataset: {profile.file_name}",
        f"Rows: {profile.row_count}, Columns: {profile.column_count}",
        f"Columns:\n{cols}",
    ]
    if profile.excel_meta:
        m = profile.excel_meta
        lines.append(
            f"Excel ingest: sheet={m.sheet_name!r}, header_row={m.header_row}, "
            f"merged_cells_resolved={m.merged_cells_resolved}, merge_support={m.merge_support}"
        )
    return "\n".join(lines)


def _uses_strict_schema(model: str) -> bool:
    lower = model.lower()
    return lower.startswith("gpt-") or lower.startswith("openai/")


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


def _parse_pipeline_content(content: Any) -> dict[str, Any]:
    if isinstance(content, dict):
        data = content
    elif isinstance(content, str):
        data = json.loads(_strip_json_fences(content))
    else:
        raise ValueError(f"Unexpected response type: {type(content)}")
    return normalize_pipeline_data(data)


def _validate_pipeline(data: dict[str, Any], strict: bool) -> PipelinePlan:
    if strict:
        typed = TypedPipelinePlan.model_validate(data)
        return typed.to_pipeline_plan()
    return PipelinePlan.model_validate(data)


def _build_generation_messages(
    session: SessionState,
    intent_msg: str,
    error_feedback: str | None = None,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": PLAN_SYSTEM_PROMPT},
        {"role": "system", "content": f"Dataset profile:\n{_profile_context(session.profile)}"},
        *session.chat_history,
        {"role": "user", "content": intent_msg},
    ]
    if error_feedback:
        messages.append(
            {
                "role": "user",
                "content": (
                    f"The previous JSON was invalid. Fix it and return ONLY corrected JSON.\n"
                    f"Validation error: {error_feedback}"
                ),
            }
        )
    return messages


async def _call_llm(
    messages: list[dict[str, str]],
    use_structured: bool,
) -> Any:
    kwargs: dict[str, Any] = {
        "model": LITELLM_MODEL,
        "messages": messages,
    }
    if use_structured:
        kwargs["response_format"] = TypedPipelinePlan
    response = await litellm.acompletion(**kwargs)
    return response.choices[0].message.content


async def chat_stream(
    session: SessionState,
    user_message: str,
) -> AsyncGenerator[str, None]:
    session.chat_history.append({"role": "user", "content": user_message})

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Dataset profile:\n{_profile_context(session.profile)}"},
        *session.chat_history,
    ]

    response = await litellm.acompletion(
        model=LITELLM_MODEL,
        messages=messages,
        stream=True,
    )

    full_response = ""
    async for chunk in response:
        delta = chunk.choices[0].delta.content or ""
        if delta:
            full_response += delta
            yield delta

    session.chat_history.append({"role": "assistant", "content": full_response})


async def generate_pipeline(session: SessionState, intent: str | None = None) -> PipelinePlan:
    intent_msg = intent or "Create a pipeline based on our conversation so far."
    use_structured = _uses_strict_schema(LITELLM_MODEL)
    last_error: str | None = None

    for attempt in range(2):
        messages = _build_generation_messages(session, intent_msg, last_error)

        logger.info(
            "Pipeline generation prompt | session=%s model=%s attempt=%d structured=%s intent=%r\n%s",
            session.session_id,
            LITELLM_MODEL,
            attempt + 1,
            use_structured,
            intent_msg,
            json.dumps(messages, indent=2),
        )

        content = await _call_llm(messages, use_structured=use_structured)

        try:
            data = _parse_pipeline_content(content)
            plan = _validate_pipeline(data, strict=use_structured)
            logger.info(
                "Pipeline generation output | session=%s\n%s",
                session.session_id,
                plan.model_dump_json(indent=2),
            )
            session.pipeline = plan
            return plan
        except Exception as e:
            last_error = str(e)
            logger.warning(
                "Pipeline validation failed | session=%s attempt=%d error=%s",
                session.session_id,
                attempt + 1,
                last_error,
            )
            if attempt == 1:
                raise ValueError(f"Pipeline generation failed after retry: {last_error}") from e

    raise ValueError("Pipeline generation failed")
