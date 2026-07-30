import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { PipelinePlan, PipelineStep, ExecutionResult } from "../types";
import { executePipeline, getPipeline, updatePipeline, downloadDataset, getExecutionStatus } from "../lib/api";
import { executePipelineLocally } from "../lib/executor";
import StepNode from "./StepNode";
import StepEditor from "./StepEditor";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import ProgressBar from "./ui/ProgressBar";

const nodeTypes = { stepNode: StepNode };

interface Props {
  sessionId: string | null;
  refreshKey: number;
  onExecuted: (result: ExecutionResult) => void;
  onPipelineChange?: (plan: PipelinePlan) => void;
  onOpenWebhooks?: () => void;
  processOnClient?: boolean;
  onRefreshBilling?: () => void;
}

function planToFlow(plan: PipelinePlan): { nodes: Node[]; edges: Edge[] } {
  const steps = plan?.steps || [];
  const edges = plan?.edges || [];
  const nodes: Node[] = steps.map((step, idx) => {
    const pos =
      step.position && typeof step.position.x === "number" && typeof step.position.y === "number"
        ? step.position
        : { x: 100, y: idx * 120 };
    return {
      id: step.id || `step_${idx}`,
      type: "stepNode",
      position: pos,
      data: { step: { ...step, position: pos } },
    };
  });
  const flowEdges: Edge[] = edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: "#22d3ee", strokeWidth: 2 },
  }));
  return { nodes, edges: flowEdges };
}

function flowToPlan(
  name: string,
  nodes: Node[],
  edges: Edge[],
): PipelinePlan {
  const steps: PipelineStep[] = nodes.map((n) => {
    const step = (n.data as { step: PipelineStep }).step;
    return { ...step, position: n.position };
  });
  return {
    name,
    steps,
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
  };
}

export default function PipelineCanvas({ sessionId, refreshKey, onExecuted, onPipelineChange, onOpenWebhooks, processOnClient, onRefreshBilling }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [planName, setPlanName] = useState("Untitled Pipeline");
  const [selectedStep, setSelectedStep] = useState<PipelineStep | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runStatus, setRunStatus] = useState("");
  const [dataset, setDataset] = useState<Record<string, any>[] | null>(null);

  useEffect(() => {
    setDataset(null);
  }, [sessionId]);

  const loadPipeline = useCallback(async () => {
    if (!sessionId) return;
    setLoadingPipeline(true);
    try {
      const plan = await getPipeline(sessionId);
      if (plan) {
        setPlanName(plan.name || "Untitled Pipeline");
        const { nodes: n, edges: e } = planToFlow(plan);
        setNodes(n);
        setEdges(e);
        onPipelineChange?.(plan);
      }
    } catch (err) {
      console.error("Error loading pipeline for session:", err);
    } finally {
      setLoadingPipeline(false);
    }
  }, [sessionId, setNodes, setEdges, onPipelineChange]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline, refreshKey]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge({ ...connection, animated: true, style: { stroke: "#22d3ee", strokeWidth: 2 } }, eds),
      ),
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const step = (node.data as { step: PipelineStep }).step;
    setSelectedStep(step);
  }, []);

  const handleSave = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      const plan = flowToPlan(planName, nodes, edges);
      await updatePipeline(sessionId, plan);
      onPipelineChange?.(plan);
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!sessionId) return;
    setRunning(true);
    setRunProgress(5);
    setRunStatus("Syncing pipeline state…");
    try {
      await handleSave();
      setRunProgress(20);

      if (processOnClient) {
        setRunStatus("Downloading dataset…");
        setRunProgress(35);
        let currentDataset = dataset;
        if (!currentDataset) {
          currentDataset = await downloadDataset(sessionId);
          setDataset(currentDataset);
        }
        setRunProgress(60);
        setRunStatus("Executing pipeline locally…");
        const plan = flowToPlan(planName, nodes, edges);
        const result = executePipelineLocally(currentDataset, plan);
        setRunProgress(100);
        setRunStatus("Done!");
        onExecuted(result);
        // Local execution records usage instantly — refresh immediately
        onRefreshBilling?.();
      } else {
        setRunStatus("Submitting to backend…");
        await executePipeline(sessionId);
        // record_usage fires on the backend immediately at /execute
        // Refresh billing now to capture the run count increment
        onRefreshBilling?.();
        setRunProgress(40);
        setRunStatus("Waiting for results…");

        let done = false;
        let pollCount = 0;
        const MAX_POLLS = 100;
        while (!done && pollCount < MAX_POLLS) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const statusRes = await getExecutionStatus(sessionId);
          // Increment progress from 40 → 92 over MAX_POLLS iterations
          const pct = 40 + Math.round((pollCount / MAX_POLLS) * 52);
          setRunProgress(pct);
          if (statusRes.status === "completed") {
            setRunProgress(100);
            setRunStatus("Done!");
            if (statusRes.result) {
              onExecuted(statusRes.result);
            }
            done = true;
          } else if (statusRes.status === "failed") {
            throw new Error(statusRes.error || "Backend pipeline execution failed");
          }
          pollCount++;
        }
        if (!done) {
          throw new Error("Execution timed out");
        }
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Execution failed");
    } finally {
      // brief pause so user sees 100% before hiding
      setTimeout(() => {
        setRunning(false);
        setRunProgress(0);
        setRunStatus("");
        // Secondary refresh after 2s to catch any async Firestore writes
        setTimeout(() => onRefreshBilling?.(), 2000);
      }, 600);
    }
  };

  const handleAddStep = () => {
    const id = `step_${Date.now()}`;
    const newStep: PipelineStep = {
      id,
      type: "filter",
      label: "New Step",
      params: { column: "", op: "eq", value: "" },
      position: { x: 100, y: nodes.length * 120 },
    };
    setNodes((nds) => [
      ...nds,
      { id, type: "stepNode", position: newStep.position, data: { step: newStep } },
    ]);
  };

  const handleStepChange = (updated: PipelineStep) => {
    setSelectedStep(updated);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === updated.id ? { ...n, data: { step: updated } } : n,
      ),
    );
  };

  const defaultEdgeOptions = useMemo(
    () => ({ animated: true, style: { stroke: "#22d3ee", strokeWidth: 2 } }),
    [],
  );

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <div className="flex flex-col border-b section-divider glass-panel">
          {/* Toolbar row */}
          <div className="flex items-center gap-2 p-3">
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="font-display text-sm tracking-wide text-slate-200 bg-transparent border-none outline-none flex-1 uppercase"
            />
            <Button variant="secondary" size="sm" onClick={handleAddStep} disabled={!sessionId}>
              + Add Step
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSave} disabled={!sessionId || saving}>
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                  </svg>
                  Saving
                </span>
              ) : "Save"}
            </Button>
            {onOpenWebhooks && (
              <Button
                id="toolbar-save-webhook-btn"
                variant="secondary"
                size="sm"
                onClick={onOpenWebhooks}
                disabled={!sessionId}
                title="Save & configure persistent webhook trigger for this pipeline"
              >
                ⚡ Save Webhook
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleRun}
              disabled={!sessionId || running || loadingPipeline || nodes.length === 0}
            >
              {running ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                  </svg>
                  {runProgress < 100 ? `${runProgress}%` : "Done!"}
                </span>
              ) : "▶ Run Pipeline"}
            </Button>
          </div>

          {/* Pipeline load progress bar */}
          {loadingPipeline && !running && !saving && (
            <div className="px-3 pb-2">
              <ProgressBar
                variant="indeterminate"
                height="h-1"
                label="Loading pipeline…"
              />
            </div>
          )}

          {/* Run progress bar */}
          {running && (
            <div className="px-3 pb-2">
              <ProgressBar
                variant="determinate"
                value={runProgress}
                height="h-1"
                label={runStatus}
              />
            </div>
          )}

          {/* Save progress bar */}
          {saving && !running && (
            <ProgressBar variant="indeterminate" height="h-0.5" />
          )}
        </div>

        <div className="flex-1 bg-slate-950/30">
          {sessionId ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
            >
              <Background color="#1e293b" gap={20} size={1} />
              <Controls />
              <MiniMap
                nodeColor="#22d3ee"
                maskColor="rgba(10, 14, 23, 0.8)"
              />
            </ReactFlow>
          ) : (
            <EmptyState
              icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-12 h-12">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              title="Pipeline Canvas"
              message="Upload data and generate a pipeline to get started"
            />
          )}
        </div>
      </div>

      {selectedStep && (
        <StepEditor
          step={selectedStep}
          onChange={handleStepChange}
          onClose={() => setSelectedStep(null)}
        />
      )}
    </div>
  );
}
