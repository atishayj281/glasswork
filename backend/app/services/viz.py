import json
from typing import Any

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio


def build_chart(df: pd.DataFrame, params: dict[str, Any]) -> dict[str, Any]:
    chart_type = params.get("chart_type", "bar")
    x = params.get("x")
    y = params.get("y")
    title = params.get("title", "Chart")
    color = params.get("color")

    fig = None
    if chart_type == "bar" and x and y:
        fig = px.bar(df, x=x, y=y, color=color, title=title)
    elif chart_type == "line" and x and y:
        fig = px.line(df, x=x, y=y, color=color, title=title)
    elif chart_type == "scatter" and x and y:
        fig = px.scatter(df, x=x, y=y, color=color, title=title)
    elif chart_type == "pie" and x and y:
        fig = px.pie(df, names=x, values=y, title=title)
    elif chart_type == "histogram" and x:
        fig = px.histogram(df, x=x, color=color, title=title)
    elif chart_type == "heatmap":
        numeric = df.select_dtypes(include="number")
        if numeric.shape[1] >= 2:
            corr = numeric.corr()
            fig = go.Figure(
                data=go.Heatmap(
                    z=corr.values,
                    x=list(corr.columns),
                    y=list(corr.index),
                    colorscale="RdBu",
                )
            )
            fig.update_layout(title=title)
        else:
            fig = go.Figure()
            fig.update_layout(title="Not enough numeric columns for heatmap")
    elif chart_type == "box" and x and y:
        fig = px.box(df, x=x, y=y, color=color, title=title)
    else:
        if x and y:
            fig = px.bar(df, x=x, y=y, title=title)
        else:
            fig = go.Figure()
            fig.update_layout(title="Insufficient chart parameters")


    return json.loads(pio.to_json(fig, pretty=False))
