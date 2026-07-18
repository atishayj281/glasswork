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

const nodeTypes = { stepNode: StepNode };

interface Props {
  sessionId: string | null;
  refreshKey: number;
  onExecuted: (result: ExecutionResult) => void;
  onPipelineChange?: (plan: PipelinePlan) => void;
  processOnClient?: boolean;
}

function planToFlow(plan: PipelinePlan): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = plan.steps.map((step) => ({
    id: step.id,
    type: "stepNode",
    position: step.position,
    data: { step },
  }));
  const edges: Edge[] = plan.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: "#22d3ee", strokeWidth: 2 },
  }));
  return { nodes, edges };
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

export default function PipelineCanvas({ sessionId, refreshKey, onExecuted, onPipelineChange, processOnClient }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [planName, setPlanName] = useState("Untitled Pipeline");
  const [selectedStep, setSelectedStep] = useState<PipelineStep | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataset, setDataset] = useState<Record<string, any>[] | null>(null);

  useEffect(() => {
    setDataset(null);
  }, [sessionId]);

  const loadPipeline = useCallback(async () => {
    if (!sessionId) return;
    const plan = await getPipeline(sessionId);
    if (plan) {
      setPlanName(plan.name);
      const { nodes: n, edges: e } = planToFlow(plan);
      setNodes(n);
      setEdges(e);
      onPipelineChange?.(plan);
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
    try {
      await handleSave();
      
      if (processOnClient) {
        let currentDataset = dataset;
        if (!currentDataset) {
          currentDataset = await downloadDataset(sessionId);
          setDataset(currentDataset);
        }
        const plan = flowToPlan(planName, nodes, edges);
        const result = executePipelineLocally(currentDataset, plan);
        onExecuted(result);
      } else {
        await executePipeline(sessionId);
        
        let done = false;
        let pollCount = 0;
        while (!done && pollCount < 100) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const statusRes = await getExecutionStatus(sessionId);
          if (statusRes.status === "completed") {
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
      setRunning(false);
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
        <div className="flex items-center gap-2 p-3 border-b section-divider glass-panel">
          <input
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            className="font-display text-sm tracking-wide text-slate-200 bg-transparent border-none outline-none flex-1 uppercase"
          />
          <Button variant="secondary" size="sm" onClick={handleAddStep} disabled={!sessionId}>
            + Add Step
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSave} disabled={!sessionId || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={!sessionId || running || nodes.length === 0}
          >
            {running ? "Running..." : "Run Pipeline"}
          </Button>
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
