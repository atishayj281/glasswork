import type { PipelinePlan, PipelineStep, ExecutionResult, VizSpec, StepLog } from "../types";

function safeEval(expression: string, row: Record<string, any>): number {
  let expr = expression;
  // Sort keys descending by length to avoid partial replacement issues (e.g. replacing 'tax' inside 'tax_rate')
  const cols = Object.keys(row).sort((a, b) => b.length - a.length);
  
  for (const col of cols) {
    const val = row[col];
    const numVal = typeof val === "number" ? val : parseFloat(val) || 0;
    const escapedCol = col.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedCol}\\b`, "g");
    expr = expr.replace(regex, String(numVal));
  }

  // Validate the expression contains only numbers, basic operators, decimals, parentheses, and whitespace
  if (/^[0-9.+\-*/()\s]+$/.test(expr)) {
    try {
      return new Function(`return (${expr})`)();
    } catch {
      return 0;
    }
  }
  return 0;
}

function applyFilter(df: any[], params: Record<string, any>): any[] {
  const col = params.column;
  const op = params.op || "eq";
  const val = params.value;

  if (!col) return df;

  return df.filter((row) => {
    const cell = row[col];
    
    if (op === "is_null") return cell === null || cell === undefined || (typeof cell === "number" && isNaN(cell));
    if (op === "not_null") return cell !== null && cell !== undefined && !(typeof cell === "number" && isNaN(cell));

    if (cell === null || cell === undefined) return false;

    // Type alignment for comparison
    let target = val;
    let source = cell;
    if (typeof cell === "number") {
      target = Number(val);
    } else {
      source = String(cell);
      target = String(val);
    }

    if (op === "eq") return source === target;
    if (op === "neq") return source !== target;
    if (op === "gt") return source > target;
    if (op === "gte") return source >= target;
    if (op === "lt") return source < target;
    if (op === "lte") return source <= target;
    if (op === "contains") return String(source).toLowerCase().includes(String(target).toLowerCase());
    if (op === "between") {
      if (Array.isArray(val) && val.length === 2) {
        let min = val[0];
        let max = val[1];
        if (typeof cell === "number") {
          min = Number(min);
          max = Number(max);
        }
        return cell >= min && cell <= max;
      }
      return true;
    }

    return true;
  });
}

function applySelectColumns(df: any[], params: Record<string, any>): any[] {
  const cols: string[] = params.columns || [];
  if (cols.length === 0) return df;
  return df.map((row) => {
    const newRow: Record<string, any> = {};
    cols.forEach((c) => {
      newRow[c] = row[c];
    });
    return newRow;
  });
}

function applyRename(df: any[], params: Record<string, any>): any[] {
  const mapping: Record<string, string> = params.mapping || {};
  return df.map((row) => {
    const newRow: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      const newKey = mapping[k] || k;
      newRow[newKey] = row[k];
    });
    return newRow;
  });
}

function applyFillNa(df: any[], params: Record<string, any>): any[] {
  const cols: string[] | null = params.columns || null;
  const value = params.value !== undefined ? params.value : 0;

  return df.map((row) => {
    const newRow = { ...row };
    const targetCols = cols || Object.keys(row);
    targetCols.forEach((c) => {
      if (newRow[c] === null || newRow[c] === undefined || (typeof newRow[c] === "number" && isNaN(newRow[c]))) {
        newRow[c] = value;
      }
    });
    return newRow;
  });
}

function applyCastType(df: any[], params: Record<string, any>): any[] {
  const col = params.column;
  const dtype = params.dtype || "str";

  if (!col) return df;

  return df.map((row) => {
    const newRow = { ...row };
    const val = row[col];
    if (val === null || val === undefined) return newRow;

    if (dtype === "int") {
      newRow[col] = parseInt(val, 10) || 0;
    } else if (dtype === "float") {
      newRow[col] = parseFloat(val) || 0.0;
    } else if (dtype === "datetime") {
      const parsed = Date.parse(val);
      newRow[col] = isNaN(parsed) ? val : new Date(parsed).toISOString();
    } else {
      newRow[col] = String(val);
    }
    return newRow;
  });
}

function applyGroupByAgg(df: any[], params: Record<string, any>): any[] {
  const groupBy: string[] = params.group_by || [];
  const aggregations: Record<string, string> = params.aggregations || {};

  if (groupBy.length === 0) {
    if (df.length === 0) return [{}];
    // Global aggregation
    const result: Record<string, any> = {};
    Object.keys(aggregations).forEach((outCol) => {
      const func = aggregations[outCol];
      result[outCol] = runAggFunction(df, outCol, func);
    });
    return [result];
  }

  // Grouping rows
  const groups: Record<string, any[]> = {};
  df.forEach((row) => {
    const key = groupBy.map((g) => String(row[g] ?? "")).join("::");
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  const result: any[] = [];
  Object.keys(groups).forEach((key) => {
    const groupRows = groups[key];
    const outRow: Record<string, any> = {};
    // Keep group values
    groupBy.forEach((g) => {
      outRow[g] = groupRows[0][g];
    });
    // Run aggregations
    Object.keys(aggregations).forEach((outCol) => {
      const func = aggregations[outCol];
      outRow[outCol] = runAggFunction(groupRows, outCol, func);
    });
    result.push(outRow);
  });

  return result;
}

function runAggFunction(rows: any[], col: string, func: string): number {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => parseFloat(r[col])).filter((v) => !isNaN(v));
  if (values.length === 0 && func !== "count") return 0;

  if (func === "sum") return values.reduce((a, b) => a + b, 0);
  if (func === "count") return rows.length;
  if (func === "mean") return values.reduce((a, b) => a + b, 0) / values.length;
  if (func === "min") return Math.min(...values);
  if (func === "max") return Math.max(...values);
  return 0;
}

function applySort(df: any[], params: Record<string, any>): any[] {
  const cols: string[] = params.columns || [];
  const ascending = params.ascending !== undefined ? params.ascending : true;

  if (cols.length === 0) return df;

  return [...df].sort((a, b) => {
    for (const c of cols) {
      const valA = a[c];
      const valB = b[c];
      if (valA === valB) continue;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      
      const comp = valA < valB ? -1 : 1;
      return ascending ? comp : -comp;
    }
    return 0;
  });
}

function applyDeduplicate(df: any[], params: Record<string, any>): any[] {
  const subset: string[] | null = params.subset || null;
  const seen = new Set<string>();

  return df.filter((row) => {
    const keys = subset || Object.keys(row);
    const key = keys.map((k) => String(row[k] ?? "")).join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyComputeColumn(df: any[], params: Record<string, any>): any[] {
  const name = params.name;
  const expr = params.expression;

  if (!name || !expr) return df;

  return df.map((row) => {
    const newRow = { ...row };
    newRow[name] = safeEval(expr, row);
    return newRow;
  });
}

function buildPlotlyChart(df: Record<string, any>[], params: Record<string, any>): Record<string, any> {
  const chartType = params.chart_type || "bar";
  const x = params.x;
  const y = params.y;
  const title = params.title || "Chart";
  const color = params.color;

  let data: any[] = [];
  const layout: any = {
    title,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: "#cbd5e1" },
    xaxis: { gridcolor: "#334155", color: "#cbd5e1" },
    yaxis: { gridcolor: "#334155", color: "#cbd5e1" }
  };

  if (chartType === "heatmap") {
    const numericCols = Object.keys(df[0] || {}).filter((col) => {
      const val = df[0][col];
      return typeof val === "number" || (!isNaN(parseFloat(val)) && isFinite(val));
    });

    if (numericCols.length >= 2) {
      const dataMatrix = numericCols.map((col) =>
        df.map((r) => {
          const val = r[col];
          return typeof val === "number" ? val : parseFloat(val) || 0;
        })
      );
      
      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const stdDev = (arr: number[], m: number) =>
        Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length);
      
      const means = dataMatrix.map((arr) => mean(arr));
      const stds = dataMatrix.map((arr, idx) => stdDev(arr, means[idx]));
      
      const corr: number[][] = [];
      for (let i = 0; i < numericCols.length; i++) {
        corr[i] = [];
        for (let j = 0; j < numericCols.length; j++) {
          if (stds[i] === 0 || stds[j] === 0) {
            corr[i][j] = i === j ? 1 : 0;
            continue;
          }
          let cov = 0;
          for (let k = 0; k < df.length; k++) {
            cov += (dataMatrix[i][k] - means[i]) * (dataMatrix[j][k] - means[j]);
          }
          cov /= df.length;
          corr[i][j] = cov / (stds[i] * stds[j]);
        }
      }

      data = [
        {
          type: "heatmap",
          z: corr,
          x: numericCols,
          y: numericCols,
          colorscale: "RdBu",
          zmin: -1,
          zmax: 1
        }
      ];
    } else {
      layout.title = "Not enough numeric columns for heatmap";
    }
  } else if (chartType === "pie" && x && y) {
    const labels = df.map((r) => String(r[x]));
    const values = df.map((r) => (typeof r[y] === "number" ? r[y] : parseFloat(r[y]) || 0));
    data = [
      {
        type: "pie",
        labels,
        values,
        textinfo: "label+percent"
      }
    ];
  } else if (chartType === "histogram" && x) {
    const xData = df.map((r) => (typeof r[x] === "number" ? r[x] : parseFloat(r[x]) || r[x]));
    data = [
      {
        type: "histogram",
        x: xData,
        name: x
      }
    ];
  } else if (x && y) {
    const xData = df.map((r) => r[x]);
    const yData = df.map((r) => (typeof r[y] === "number" ? r[y] : parseFloat(r[y]) || 0));
    const plotlyType = chartType === "scatter" ? "scatter" : chartType === "line" ? "scatter" : "bar";
    const mode = chartType === "line" ? "lines+markers" : chartType === "scatter" ? "markers" : undefined;

    if (color) {
      const groups: Record<string, any[]> = {};
      df.forEach((r) => {
        const gVal = String(r[color]);
        if (!groups[gVal]) groups[gVal] = [];
        groups[gVal].push(r);
      });
      data = Object.keys(groups).map((gVal) => {
        const gRows = groups[gVal];
        return {
          type: plotlyType,
          mode,
          name: gVal,
          x: gRows.map((r) => r[x]),
          y: gRows.map((r) => (typeof r[y] === "number" ? r[y] : parseFloat(r[y]) || 0))
        };
      });
    } else {
      data = [
        {
          type: plotlyType,
          mode,
          x: xData,
          y: yData,
          name: y
        }
      ];
    }
  } else {
    layout.title = "Insufficient chart parameters";
  }

  return { data, layout };
}

export function executePipelineLocally(df: Record<string, any>[], plan: PipelinePlan): ExecutionResult {
  const steps = plan.steps;
  const edges = plan.edges;

  const parents: Record<string, string[]> = {};
  const children: Record<string, string[]> = {};
  const stepMap: Record<string, PipelineStep> = {};

  steps.forEach((s) => {
    parents[s.id] = [];
    children[s.id] = [];
    stepMap[s.id] = s;
  });

  edges.forEach((edge) => {
    if (stepMap[edge.source] && stepMap[edge.target]) {
      children[edge.source].push(edge.target);
      parents[edge.target].push(edge.source);
    }
  });

  const outputs: Record<string, any[]> = {};
  const logs: StepLog[] = [];
  const vizSpecs: VizSpec[] = [];

  // Run in order of steps array (topological generation assumes they are ordered correctly)
  for (const step of steps) {
    const stepParents = parents[step.id] || [];
    let inputData: any[] = [];

    if (stepParents.length === 0) {
      inputData = df.map((r) => ({ ...r }));
    } else if (stepParents.length === 1) {
      inputData = (outputs[stepParents[0]] || []).map((r) => ({ ...r }));
    } else {
      // Fan-in: use the last parent's output (normalizer should have linearized this,
      // but handle gracefully here as a safety net)
      const lastParent = stepParents[stepParents.length - 1];
      inputData = (outputs[lastParent] || []).map((r) => ({ ...r }));
    }

    const rowsIn = inputData.length;
    const start = performance.now();
    let resultData = inputData;
    let message = "";

    try {
      if (step.type === "filter") {
        resultData = applyFilter(inputData, step.params);
        message = `Filtered dataset (records in: ${rowsIn}, out: ${resultData.length})`;
      } else if (step.type === "select_columns") {
        resultData = applySelectColumns(inputData, step.params);
        message = `Selected columns: ${step.params.columns ? (step.params.columns as string[]).join(", ") : ""}`;
      } else if (step.type === "rename") {
        resultData = applyRename(inputData, step.params);
        message = "Renamed columns";
      } else if (step.type === "fill_na") {
        resultData = applyFillNa(inputData, step.params);
        message = "Filled null values";
      } else if (step.type === "cast_type") {
        resultData = applyCastType(inputData, step.params);
        message = `Casted type for column ${step.params.column}`;
      } else if (step.type === "groupby_agg") {
        resultData = applyGroupByAgg(inputData, step.params);
        message = "Grouped and aggregated data";
      } else if (step.type === "sort") {
        resultData = applySort(inputData, step.params);
        message = "Sorted dataset";
      } else if (step.type === "deduplicate") {
        resultData = applyDeduplicate(inputData, step.params);
        message = "Removed duplicate rows";
      } else if (step.type === "compute_column") {
        resultData = applyComputeColumn(inputData, step.params);
        message = `Computed column '${step.params.name}'`;
      } else if (step.type === "visualize") {
        // Build chart
        const chartFig = buildPlotlyChart(inputData, step.params);
        vizSpecs.push({
          step_id: step.id,
          chart_type: String(step.params.chart_type || "bar"),
          title: String(step.params.title || step.label),
          figure: chartFig
        });
        message = `Generated ${step.params.chart_type || "bar"} chart`;
      }
      outputs[step.id] = resultData;
    } catch (e: any) {
      throw new Error(`Step '${step.label}' (${step.id}) failed: ${e.message}`);
    }

    const duration = performance.now() - start;
    logs.push({
      step_id: step.id,
      step_type: step.type,
      label: step.label,
      rows_in: rowsIn,
      rows_out: resultData.length,
      duration_ms: Math.round(duration * 100) / 100,
      message
    });
  }

  // Select preview sink step
  const sinkIds = Object.keys(stepMap).filter((sid) => children[sid].length === 0);
  let previewStepId = steps[steps.length - 1]?.id || "";
  
  if (sinkIds.length > 0) {
    const nonVizSinks = sinkIds.filter((sid) => stepMap[sid].type !== "visualize");
    const candidates = nonVizSinks.length > 0 ? nonVizSinks : sinkIds;
    
    // Choose candidates with max rows output
    let maxRows = -1;
    candidates.forEach((sid) => {
      const out = outputs[sid] || [];
      if (out.length > maxRows) {
        maxRows = out.length;
        previewStepId = sid;
      }
    });
  }

  const finalOutput = outputs[previewStepId] || [];
  // Take first 50 rows for preview
  const preview = finalOutput.slice(0, 50);
  const columns = finalOutput.length > 0 ? Object.keys(finalOutput[0]) : [];

  return {
    preview,
    columns,
    row_count: finalOutput.length,
    viz_specs: vizSpecs,
    execution_log: logs,
    preview_step_id: previewStepId
  };
}
