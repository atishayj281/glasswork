import type { Layout } from "plotly.js";

const defaultTitle = {
  font: {
    family: "Orbitron, sans-serif",
    color: "#e2e8f0",
    size: 14,
  },
};

const darkLayoutDefaults: Partial<Layout> = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "rgba(15, 23, 42, 0.3)",
  font: {
    family: "Exo 2, sans-serif",
    color: "#94a3b8",
    size: 12,
  },
  title: defaultTitle,
  xaxis: {
    gridcolor: "rgba(34, 211, 238, 0.08)",
    linecolor: "rgba(34, 211, 238, 0.2)",
    tickcolor: "rgba(34, 211, 238, 0.2)",
    tickfont: { color: "#64748b", size: 10 },
    title: { font: { color: "#94a3b8" } },
  },
  yaxis: {
    gridcolor: "rgba(34, 211, 238, 0.08)",
    linecolor: "rgba(34, 211, 238, 0.2)",
    tickcolor: "rgba(34, 211, 238, 0.2)",
    tickfont: { color: "#64748b", size: 10 },
    title: { font: { color: "#94a3b8" } },
  },
  colorway: ["#22d3ee", "#a78bfa", "#34d399", "#3b82f6", "#e879f9", "#f59e0b"],
  margin: { t: 40, r: 20, b: 40, l: 50 },
};

export function withDarkTheme(layout: Partial<Layout> = {}): Partial<Layout> {
  return {
    ...darkLayoutDefaults,
    ...layout,
    font: { ...darkLayoutDefaults.font, ...layout.font },
    title: layout.title
      ? typeof layout.title === "string"
        ? { ...defaultTitle, text: layout.title }
        : { ...defaultTitle, ...(layout.title as Record<string, unknown>) }
      : defaultTitle,
    xaxis: { ...darkLayoutDefaults.xaxis, ...(layout.xaxis as object) },
    yaxis: { ...darkLayoutDefaults.yaxis, ...(layout.yaxis as object) },
    autosize: true,
  };
}
