from typing import Any, Literal, Union

from pydantic import BaseModel, Field, model_validator

StepType = Literal[
    "filter",
    "select_columns",
    "rename",
    "fill_na",
    "cast_type",
    "groupby_agg",
    "sort",
    "deduplicate",
    "compute_column",
    "visualize",
]

FilterOp = Literal["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_null", "not_null"]
AggFunc = Literal["sum", "count", "mean", "min", "max"]
ChartType = Literal["bar", "line", "scatter", "pie", "histogram", "heatmap"]
CastDtype = Literal["int", "float", "str", "datetime"]


class NodePosition(BaseModel):
    x: float = 0
    y: float = 0


class FilterParams(BaseModel):
    column: str
    op: FilterOp = "eq"
    value: Any = None


class SelectColumnsParams(BaseModel):
    columns: list[str]


class RenameParams(BaseModel):
    mapping: dict[str, str]


class FillNaParams(BaseModel):
    columns: list[str] | None = None
    value: Any = 0


class CastTypeParams(BaseModel):
    column: str
    dtype: CastDtype = "str"


class GroupByParams(BaseModel):
    group_by: list[str] = Field(default_factory=list)
    aggregations: dict[str, AggFunc]


class SortParams(BaseModel):
    columns: list[str]
    ascending: bool = True


class DeduplicateParams(BaseModel):
    subset: list[str] | None = None


class ComputeColumnParams(BaseModel):
    name: str
    expression: str


class VisualizeParams(BaseModel):
    chart_type: ChartType = "bar"
    x: str | None = None
    y: str | None = None
    title: str | None = None
    color: str | None = None


class FilterStep(BaseModel):
    id: str
    type: Literal["filter"]
    label: str
    params: FilterParams
    position: NodePosition = Field(default_factory=NodePosition)


class SelectColumnsStep(BaseModel):
    id: str
    type: Literal["select_columns"]
    label: str
    params: SelectColumnsParams
    position: NodePosition = Field(default_factory=NodePosition)


class RenameStep(BaseModel):
    id: str
    type: Literal["rename"]
    label: str
    params: RenameParams
    position: NodePosition = Field(default_factory=NodePosition)


class FillNaStep(BaseModel):
    id: str
    type: Literal["fill_na"]
    label: str
    params: FillNaParams
    position: NodePosition = Field(default_factory=NodePosition)


class CastTypeStep(BaseModel):
    id: str
    type: Literal["cast_type"]
    label: str
    params: CastTypeParams
    position: NodePosition = Field(default_factory=NodePosition)


class GroupByStep(BaseModel):
    id: str
    type: Literal["groupby_agg"]
    label: str
    params: GroupByParams
    position: NodePosition = Field(default_factory=NodePosition)


class SortStep(BaseModel):
    id: str
    type: Literal["sort"]
    label: str
    params: SortParams
    position: NodePosition = Field(default_factory=NodePosition)


class DeduplicateStep(BaseModel):
    id: str
    type: Literal["deduplicate"]
    label: str
    params: DeduplicateParams
    position: NodePosition = Field(default_factory=NodePosition)


class ComputeColumnStep(BaseModel):
    id: str
    type: Literal["compute_column"]
    label: str
    params: ComputeColumnParams
    position: NodePosition = Field(default_factory=NodePosition)


class VisualizeStep(BaseModel):
    id: str
    type: Literal["visualize"]
    label: str
    params: VisualizeParams
    position: NodePosition = Field(default_factory=NodePosition)


TypedPipelineStep = Union[
    FilterStep,
    SelectColumnsStep,
    RenameStep,
    FillNaStep,
    CastTypeStep,
    GroupByStep,
    SortStep,
    DeduplicateStep,
    ComputeColumnStep,
    VisualizeStep,
]

PARAM_MODELS: dict[str, type[BaseModel]] = {
    "filter": FilterParams,
    "select_columns": SelectColumnsParams,
    "rename": RenameParams,
    "fill_na": FillNaParams,
    "cast_type": CastTypeParams,
    "groupby_agg": GroupByParams,
    "sort": SortParams,
    "deduplicate": DeduplicateParams,
    "compute_column": ComputeColumnParams,
    "visualize": VisualizeParams,
}


class PipelineStep(BaseModel):
    id: str
    type: StepType
    label: str
    params: dict[str, Any] = Field(default_factory=dict)
    position: NodePosition = Field(default_factory=NodePosition)

    @model_validator(mode="after")
    def validate_params(self) -> "PipelineStep":
        model_cls = PARAM_MODELS.get(self.type)
        if model_cls:
            validated = model_cls.model_validate(self.params)
            self.params = validated.model_dump()
        return self


class PipelineEdge(BaseModel):
    source: str
    target: str


class PipelinePlan(BaseModel):
    name: str = "Untitled Pipeline"
    steps: list[PipelineStep] = Field(default_factory=list)
    edges: list[PipelineEdge] = Field(default_factory=list)


class TypedPipelinePlan(BaseModel):
    """Strict schema for LLM structured output (discriminated by step type)."""

    name: str = "Untitled Pipeline"
    steps: list[TypedPipelineStep]
    edges: list[PipelineEdge] = Field(default_factory=list)

    def to_pipeline_plan(self) -> PipelinePlan:
        return PipelinePlan(
            name=self.name,
            steps=[
                PipelineStep(
                    id=step.id,
                    type=step.type,
                    label=step.label,
                    params=step.params.model_dump(),
                    position=step.position,
                )
                for step in self.steps
            ],
            edges=self.edges,
        )


class StepLog(BaseModel):
    step_id: str
    step_type: str
    label: str
    rows_in: int
    rows_out: int
    duration_ms: float
    message: str = ""


class VizSpec(BaseModel):
    step_id: str
    chart_type: str
    title: str
    figure: dict[str, Any]


class ExecutionResult(BaseModel):
    preview: list[dict[str, Any]]
    columns: list[str]
    row_count: int
    viz_specs: list[VizSpec]
    execution_log: list[StepLog]
