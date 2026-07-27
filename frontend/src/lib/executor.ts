import type { PipelinePlan, PipelineStep, ExecutionResult, VizSpec, StepLog } from "../types";

// ---------------------------------------------------------------------------
// Expression compilation
// ---------------------------------------------------------------------------
// Previously, safeEval() rebuilt a regex per column AND called `new Function`
// on every single row. For an 8k-row CSV with 20 columns and two
// compute_column steps, that's ~320,000 regex compilations plus 16,000
// dynamic function compilations — by far the dominant cost in the pipeline.
//
// compileExpression() does the column-name substitution and `new Function`
// compilation ONCE per step. The returned closure just pulls values out of
// the row and calls the already-compiled function, which is orders of
// magnitude cheaper per row.

/**
 * Extract numeric value from formatted strings (e.g. "₹250", "$1,250.50", "15.5%", "(500)", "₹ 250 Cr")
 */
export function parseFormattedNumber(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (val === null || val === undefined || val === "") return 0;

  let str = String(val).trim();
  if (!str) return 0;

  // Accounting parentheses "(123.45)" -> "-123.45"
  if (/^\((.*)\)$/.test(str)) {
    str = "-" + str.slice(1, -1);
  }

  // Remove currency symbols (₹, $, €, £, ¥), commas, percent signs, and whitespace
  str = str.replace(/[₹$€£¥\s,%]/g, "");

  // Extract first numeric sequence (including sign and decimal point)
  const match = str.match(/[-+]?\d*\.?\d+/);
  if (!match) return 0;

  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
}

function compileExpression(
  expression: string,
  columnNames: string[]
): (row: Record<string, any>) => number {
  const cols = [...columnNames].sort((a, b) => b.length - a.length);

  let expr = expression;
  const usedCols: string[] = [];

  cols.forEach((col) => {
    const escapedCol = col.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const backtickedPattern = new RegExp("`" + escapedCol + "`", "g");
    if (backtickedPattern.test(expr)) {
      const idx = usedCols.length;
      usedCols.push(col);
      expr = expr.replace(backtickedPattern, `__v[${idx}]`);
    } else {
      const isIdentifier = /^[a-z_$][a-z0-9_$]*$/i.test(col);
      const regex = isIdentifier ? new RegExp(`\\b${escapedCol}\\b`, "g") : new RegExp(escapedCol, "g");
      if (regex.test(expr)) {
        const idx = usedCols.length;
        usedCols.push(col);
        expr = expr.replace(regex, `__v[${idx}]`);
      }
    }
  });

  // Validate: only numbers, basic operators, decimals, parentheses,
  // whitespace, and our __v[n] placeholders are allowed.
  if (!/^[0-9.+\-*/()\s\[\]_v]+$/.test(expr)) {
    return () => 0;
  }

  let compiled: (v: number[]) => number;
  try {
    // eslint-disable-next-line no-new-func
    compiled = new Function("__v", `return (${expr});`) as (v: number[]) => number;
  } catch {
    return () => 0;
  }

  return (row: Record<string, any>) => {
    const v = usedCols.map((c) => parseFormattedNumber(row[c]));
    try {
      const result = compiled(v);
      return typeof result === "number" && !isNaN(result) ? result : 0;
    } catch {
      return 0;
    }
  };
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

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
      newRow[col] = Math.round(parseFormattedNumber(val));
    } else if (dtype === "float") {
      newRow[col] = parseFormattedNumber(val);
    } else if (dtype === "datetime") {
      const parsed = Date.parse(val);
      newRow[col] = isNaN(parsed) ? val : new Date(parsed).toISOString();
    } else {
      newRow[col] = String(val);
    }
    return newRow;
  });
}

function runAggFunction(rows: any[], col: string, func: string): number {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => parseFormattedNumber(r[col]));
  if (values.length === 0 && func !== "count") return 0;

  if (func === "sum") return values.reduce((a, b) => a + b, 0);
  if (func === "count") return rows.length;
  if (func === "mean") return values.reduce((a, b) => a + b, 0) / values.length;
  if (func === "min") return Math.min(...values);
  if (func === "max") return Math.max(...values);
  return 0;
}

function applyGroupByAgg(df: any[], params: Record<string, any>): any[] {
  const groupBy: string[] = params.group_by || [];
  const aggregations: Record<string, any> = params.aggregations || {};

  const runAgg = (rows: any[], outCol: string, aggDef: any): number => {
    // Supports both shorthand ("sum") and object form ({ column, func })
    if (typeof aggDef === "string") {
      return runAggFunction(rows, outCol, aggDef);
    }
    const sourceCol = aggDef.column || outCol;
    const func = aggDef.func || "sum";
    return runAggFunction(rows, sourceCol, func);
  };

  if (groupBy.length === 0) {
    if (df.length === 0) return [{}];
    // Global aggregation
    const result: Record<string, any> = {};
    Object.keys(aggregations).forEach((outCol) => {
      result[outCol] = runAgg(df, outCol, aggregations[outCol]);
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
      outRow[outCol] = runAgg(groupRows, outCol, aggregations[outCol]);
    });
    result.push(outRow);
  });

  return result;
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

  if (!name || !expr || df.length === 0) return df;

  // Compile the expression ONCE per step, using the first row's columns
  // as the known column set, then reuse the compiled function for every row.
  const columnNames = Object.keys(df[0]);
  const evalFn = compileExpression(expr, columnNames);

  return df.map((row) => {
    const newRow = { ...row };
    newRow[name] = evalFn(row);
    return newRow;
  });
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

function twoTailedPValue(tStat: number, df: number): number {
  const absT = Math.abs(tStat);
  if (isNaN(absT) || !isFinite(absT)) return 1.0;
  // Standard normal CDF approximation for p-value calculation
  const p = 2 * (1 - normalCDF(absT));
  return Math.max(0, Math.min(1, p));
}

function getRanks(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(vals.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) {
      j++;
    }
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = rank;
    }
    i = j;
  }
  return ranks;
}

function applyCompareGroups(df: any[], params: Record<string, any>): any[] {
  const groupCol = params.group_by;
  const testCols: string[] = params.columns || [];
  const alpha = Number(params.alpha ?? 0.05);

  if (!groupCol || !df.length) return [];

  const uniqueGroups = Array.from(
    new Set(
      df
        .map((r) => r[groupCol])
        .filter((v) => v !== null && v !== undefined && v !== "")
        .map((v) => String(v))
    )
  ).sort();

  if (uniqueGroups.length !== 2) return [];

  const [groupAVal, groupBVal] = uniqueGroups;
  const dfA = df.filter((r) => String(r[groupCol]) === groupAVal);
  const dfB = df.filter((r) => String(r[groupCol]) === groupBVal);

  const correctedAlpha = alpha / Math.max(testCols.length, 1);
  const results: any[] = [];

  testCols.forEach((col) => {
    const aVals = dfA.map((r) => parseFormattedNumber(r[col])).filter((v) => !isNaN(v));
    const bVals = dfB.map((r) => parseFormattedNumber(r[col])).filter((v) => !isNaN(v));

    if (aVals.length < 2 || bVals.length < 2) return;

    const aMean = aVals.reduce((sum, v) => sum + v, 0) / aVals.length;
    const bMean = bVals.reduce((sum, v) => sum + v, 0) / bVals.length;

    const aVar = aVals.reduce((sum, v) => sum + Math.pow(v - aMean, 2), 0) / (aVals.length - 1);
    const bVar = bVals.reduce((sum, v) => sum + Math.pow(v - bMean, 2), 0) / (bVals.length - 1);

    const se = Math.sqrt(aVar / aVals.length + bVar / bVals.length);
    const tStat = se === 0 ? 0 : (bMean - aMean) / se;

    const num = Math.pow(aVar / aVals.length + bVar / bVals.length, 2);
    const den = Math.pow(aVar / aVals.length, 2) / (aVals.length - 1) + Math.pow(bVar / bVals.length, 2) / (bVals.length - 1);
    const dof = den === 0 ? 1 : num / den;

    const pVal = twoTailedPValue(tStat, dof);

    results.push({
      column: col,
      group_a: groupAVal,
      group_b: groupBVal,
      group_a_mean: Math.round(aMean * 1e6) / 1e6,
      group_b_mean: Math.round(bMean * 1e6) / 1e6,
      mean_diff: Math.round((bMean - aMean) * 1e6) / 1e6,
      t_statistic: Math.round(tStat * 1e6) / 1e6,
      p_value: Math.round(pVal * 1e6) / 1e6,
      significant_raw: pVal < alpha,
      significant_corrected: pVal < correctedAlpha,
    });
  });

  return results;
}

function applyCorrelation(df: any[], params: Record<string, any>): any[] {
  const xCol = params.x;
  const yCol = params.y;
  const method = params.method || "pearson";

  if (!xCol || !yCol || !df.length) return [];

  const pairs: { x: number; y: number }[] = [];
  df.forEach((r) => {
    const xVal = parseFormattedNumber(r[xCol]);
    const yVal = parseFormattedNumber(r[yCol]);
    if (!isNaN(xVal) && !isNaN(yVal)) {
      pairs.push({ x: xVal, y: yVal });
    }
  });

  if (pairs.length < 3) return [];

  let xVals = pairs.map((p) => p.x);
  let yVals = pairs.map((p) => p.y);

  if (method === "spearman") {
    xVals = getRanks(xVals);
    yVals = getRanks(yVals);
  }

  const n = pairs.length;
  const xMean = xVals.reduce((a, b) => a + b, 0) / n;
  const yMean = yVals.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xVals[i] - xMean;
    const dy = yVals[i] - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  const coef = den === 0 ? 0 : num / den;

  const tStat = Math.abs(coef) === 1 ? 999 : (coef * Math.sqrt(n - 2)) / Math.sqrt(1 - coef * coef);
  const pVal = twoTailedPValue(tStat, n - 2);

  return [
    {
      x: xCol,
      y: yCol,
      method,
      coefficient: Math.round(coef * 1e6) / 1e6,
      p_value: Math.round(pVal * 1e6) / 1e6,
      n_observations: n,
    },
  ];
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
  } else if (chartType === "box" && x && y) {
    const groups: Record<string, any[]> = {};
    df.forEach((r) => {
      const gVal = String(r[x]);
      if (!groups[gVal]) groups[gVal] = [];
      groups[gVal].push(typeof r[y] === "number" ? r[y] : parseFloat(r[y]) || 0);
    });
    data = Object.keys(groups).map((gVal) => ({
      type: "box",
      name: gVal,
      y: groups[gVal]
    }));
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

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

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
      } else if (step.type === "compare_groups") {
        resultData = applyCompareGroups(inputData, step.params);
        message = "Compared group distributions (t-test)";
      } else if (step.type === "correlation") {
        resultData = applyCorrelation(inputData, step.params);
        message = "Computed correlation coefficient";
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

  // ---------------------------------------------------------------------
  // Dev-only timing breakdown. Prints a table of every step sorted by
  // duration (worst first) so regressions like the old per-row `new
  // Function` compilation in compute_column are easy to spot at a glance.
  // ---------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const totalMs = logs.reduce((sum, l) => sum + l.duration_ms, 0);
    const sorted = [...logs].sort((a, b) => b.duration_ms - a.duration_ms);

    console.groupCollapsed(`Pipeline "${plan.name}" — ${totalMs.toFixed(2)}ms total`);
    console.table(
      sorted.map((l) => ({
        step: l.label,
        type: l.step_type,
        rows_in: l.rows_in,
        rows_out: l.rows_out,
        ms: l.duration_ms,
        "% of total": totalMs > 0 ? `${((l.duration_ms / totalMs) * 100).toFixed(1)}%` : "0.0%"
      }))
    );
    console.groupEnd();
  }

  return {
    preview,
    columns,
    row_count: finalOutput.length,
    viz_specs: vizSpecs,
    execution_log: logs,
    preview_step_id: previewStepId
  };
}