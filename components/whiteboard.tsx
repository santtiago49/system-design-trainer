"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { RotateCcw, Target } from "lucide-react";
import { CATALOG_BY_ID, resolveItem } from "@/lib/catalog";
import { SCENARIOS, SCENARIOS_BY_ID } from "@/lib/scenarios";
import { formatNumber, formatPercent, nodeName, simulate, type DesignNodeData } from "@/lib/simulate";
import type { EvaluationInput, EvaluationResult } from "@/lib/evaluation";
import { ComponentNode, type DesignNode } from "./component-node";
import { LoadEdge } from "./load-edge";
import { DRAG_TYPE, Palette } from "./palette";
import { Inspector } from "./inspector";
import { EvaluationPanel } from "./evaluation-panel";
import { SimulationContext } from "./simulation-context";

const nodeTypes = { component: ComponentNode };
const edgeTypes = { load: LoadEdge };
const USER_PRESETS = [100_000, 1_000_000, 10_000_000, 100_000_000];

type SavedDesign = { nodes: DesignNode[]; edges: Edge[]; explanation: string; users: number };

function newNode(catalogId: string, position: { x: number; y: number }): DesignNode {
  const item = CATALOG_BY_ID[catalogId];
  return {
    id: nanoid(8),
    type: "component",
    position,
    data: { catalogId, units: item?.defaultUnits ?? 1, multiAz: false, hitRate: 0.8, customName: "", customCategory: null },
  };
}

function emptyDesign(scenarioId: string): SavedDesign {
  return {
    nodes: [newNode("users", { x: 0, y: 160 })],
    edges: [],
    explanation: "",
    users: SCENARIOS_BY_ID[scenarioId].dailyActiveUsers,
  };
}

function loadDesign(scenarioId: string): SavedDesign {
  try {
    const raw = localStorage.getItem(`sdt:design:${scenarioId}`);
    if (raw) return JSON.parse(raw) as SavedDesign;
  } catch {}
  return emptyDesign(scenarioId);
}

function saveDesign(scenarioId: string, design: SavedDesign) {
  try {
    localStorage.setItem(`sdt:design:${scenarioId}`, JSON.stringify(design));
    localStorage.setItem("sdt:scenario", scenarioId);
  } catch {}
}

function Board() {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [hydrated, setHydrated] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<DesignNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [users, setUsers] = useState(SCENARIOS[0].dailyActiveUsers);
  const [explanation, setExplanation] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [evaluatedSignature, setEvaluatedSignature] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const scenario = SCENARIOS_BY_ID[scenarioId];

  const applyDesign = useCallback(
    (design: SavedDesign) => {
      setNodes(design.nodes.map((n) => ({ ...n, data: { ...n.data, classifying: false } })));
      setEdges(design.edges);
      setExplanation(design.explanation);
      setUsers(design.users);
      setSelectedId(null);
      setResult(null);
      setEvalError(null);
    },
    [setNodes, setEdges]
  );

  const switchScenario = useCallback(
    (id: string) => {
      setScenarioId(id);
      applyDesign(loadDesign(id));
      requestAnimationFrame(() => fitView({ maxZoom: 1, padding: 0.15 }));
    },
    [applyDesign, fitView]
  );

  useEffect(() => {
    let initial = SCENARIOS[0].id;
    try {
      const stored = localStorage.getItem("sdt:scenario");
      if (stored && SCENARIOS_BY_ID[stored]) initial = stored;
    } catch {}
    switchScenario(initial);
    setHydrated(true);
  }, [switchScenario]);

  useEffect(() => {
    if (hydrated) saveDesign(scenarioId, { nodes, edges, explanation, users });
  }, [hydrated, scenarioId, nodes, edges, explanation, users]);

  const simulation = useMemo(
    () => simulate(nodes.map((n) => ({ id: n.id, data: n.data })), edges, scenario, users),
    [nodes, edges, scenario, users]
  );

  const signature = useMemo(
    () => JSON.stringify([nodes.map((n) => n.data), edges.map((e) => [e.source, e.target]), users, explanation]),
    [nodes, edges, users, explanation]
  );

  const addComponent = useCallback(
    (catalogId: string, position?: { x: number; y: number }) => {
      let at = position;
      if (!at) {
        const rect = canvasRef.current?.getBoundingClientRect();
        at = screenToFlowPosition({
          x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2 + (Math.random() - 0.5) * 80,
          y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 + (Math.random() - 0.5) * 80,
        });
      }
      const node = newNode(catalogId, at);
      setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]);
      setSelectedId(node.id);
    },
    [screenToFlowPosition, setNodes]
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<DesignNodeData>) => {
      setNodes((current) => current.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((current) => current.filter((n) => n.id !== id));
      setEdges((current) => current.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges]
  );

  const classify = useCallback(
    async (id: string, name: string) => {
      updateNode(id, { customName: name, classifying: true });
      try {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        updateNode(id, {
          classifying: false,
          customCategory: data.category,
          classification: { confidence: data.confidence, mock: data.mock },
        });
      } catch {
        updateNode(id, { classifying: false });
      }
    },
    [updateNode]
  );

  const evaluate = useCallback(async () => {
    const names = new Map(nodes.map((n) => [n.id, nodeName(n.data)]));
    const components = nodes.flatMap((n) => {
      const item = resolveItem(n.data.catalogId, { name: n.data.customName ?? "", category: n.data.customCategory ?? null });
      return item ? [{ name: item.name, category: item.category, units: n.data.units, multiAz: n.data.multiAz || item.managed }] : [];
    });
    const input: EvaluationInput = {
      scenarioId,
      users,
      components,
      connections: edges.map((e) => `${names.get(e.source)} → ${names.get(e.target)}`),
      simulation: {
        peakRps: simulation.peakRps,
        supportedUsers: simulation.supportedUsers,
        bottleneck: simulation.bottleneckId ? names.get(simulation.bottleneckId) ?? null : null,
        availability: simulation.availability,
        findings: simulation.findings.map((f) => f.message),
      },
      explanation,
    };

    setEvaluating(true);
    setEvalError(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Evaluation failed");
      setResult(data);
      setEvaluatedSignature(signature);
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }, [nodes, edges, scenarioId, users, simulation, explanation, signature]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      setEdges((current) => addEdge({ ...connection, type: "load" }, current));
    },
    [setEdges]
  );

  const selected = nodes.find((n) => n.id === selectedId);
  const reachesTarget = simulation.supportedUsers >= users;
  const bottleneckName = simulation.bottleneckId
    ? nodeName(nodes.find((n) => n.id === simulation.bottleneckId)!.data)
    : null;

  return (
    <SimulationContext.Provider value={simulation}>
      <div className="grid h-screen grid-cols-[260px_1fr_340px] grid-rows-[auto_1fr]">
        {/* Top bar */}
        <header className="col-span-3 flex items-center gap-6 border-b border-line bg-white px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Target className="size-5" />
            <span className="font-semibold">System Design Trainer</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Target</span>
            <input
              type="number"
              min={1000}
              step={100000}
              value={users}
              onChange={(e) => setUsers(Math.max(1, Number(e.target.value) || 1))}
              className="w-32 rounded-lg border border-line px-2 py-1 text-sm"
            />
            <div className="flex gap-1">
              {USER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setUsers(preset)}
                  className={`rounded-md px-1.5 py-0.5 text-xs ${users === preset ? "bg-ink text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                >
                  {formatNumber(preset)}
                </button>
              ))}
            </div>
          </div>

          <div className={`ml-auto flex items-center gap-5 text-sm ${hydrated ? "" : "invisible"}`}>
            <div>
              <div className="text-[11px] text-zinc-500">Peak load</div>
              <div className="font-medium">{formatNumber(simulation.peakRps)} rps</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Supports</div>
              <div className={`font-semibold ${reachesTarget ? "text-ok" : "text-over"}`}>
                {simulation.supportedUsers === Infinity ? "∞" : formatNumber(simulation.supportedUsers)} / {formatNumber(users)} users
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Bottleneck</div>
              <div className="max-w-40 truncate font-medium">{bottleneckName ?? "—"}</div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Availability</div>
              <div className={`font-medium ${simulation.availability >= scenario.targetAvailability ? "text-ok" : "text-warn"}`}>
                {formatPercent(simulation.availability)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Est. cost</div>
              <div className="font-medium">${formatNumber(simulation.monthlyCost)}/mo</div>
            </div>
          </div>
        </header>

        {/* Left sidebar */}
        <aside className="flex min-h-0 flex-col border-r border-line bg-white">
          <div className="border-b border-line p-4">
            <select
              value={scenarioId}
              onChange={(e) => switchScenario(e.target.value)}
              className="w-full rounded-lg border border-line px-2 py-1.5 text-sm font-medium"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm">{scenario.prompt}</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-zinc-500">
              {scenario.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <button
              onClick={() => {
                if (confirm("Clear this design?")) applyDesign(emptyDesign(scenarioId));
              }}
              className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-ink"
            >
              <RotateCcw className="size-3" /> Start over
            </button>
          </div>
          <Palette onAdd={(id) => addComponent(id)} />
        </aside>

        {/* Canvas */}
        <main
          ref={canvasRef}
          className="relative min-h-0"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const catalogId = event.dataTransfer.getData(DRAG_TYPE);
            if (catalogId) addComponent(catalogId, screenToFlowPosition({ x: event.clientX - 100, y: event.clientY - 30 }));
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "load" }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onNodesDelete={(deleted) => deleted.some((n) => n.id === selectedId) && setSelectedId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} color="#d9d8d2" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-white" />
          </ReactFlow>
          {nodes.length <= 1 && (
            <div className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-zinc-400">
              Drag components from the left, then connect them starting from Users.
            </div>
          )}
        </main>

        {/* Right panel */}
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-white">
          {!hydrated ? null : selected ? (
            <>
              <button onClick={() => setSelectedId(null)} className="px-4 pt-3 text-xs text-zinc-500 hover:text-ink">
                ← Back to evaluation
              </button>
              <Inspector
                key={selected.id}
                data={selected.data}
                sim={simulation.nodes[selected.id]}
                onChange={(patch) => updateNode(selected.id, patch)}
                onDelete={() => deleteNode(selected.id)}
                onClassify={(name) => classify(selected.id, name)}
              />
            </>
          ) : (
            <EvaluationPanel
              findings={simulation.findings}
              explanation={explanation}
              onExplanationChange={setExplanation}
              result={result}
              error={evalError}
              loading={evaluating}
              stale={result !== null && evaluatedSignature !== signature}
              onEvaluate={evaluate}
              onSelectNode={(id) => {
                setSelectedId(id);
                setNodes((current) => current.map((n) => ({ ...n, selected: n.id === id })));
              }}
            />
          )}
        </aside>
      </div>
    </SimulationContext.Provider>
  );
}

export function Whiteboard() {
  return (
    <ReactFlowProvider>
      <Board />
    </ReactFlowProvider>
  );
}
