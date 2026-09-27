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
import { PanelLeftOpen, Play } from "lucide-react";
import { CATALOG_BY_ID } from "@/lib/catalog";
import { SCENARIOS, SCENARIOS_BY_ID } from "@/lib/scenarios";
import { formatNumber, simulate } from "@/lib/simulate";
import { runTests, type RunReport } from "@/lib/run";
import { ComponentNode, type DesignNode } from "./component-node";
import { LoadEdge } from "./load-edge";
import { DRAG_TYPE, Palette } from "./palette";
import { RunDrawer } from "./run-drawer";
import { SimulationContext } from "./simulation-context";

const nodeTypes = { component: ComponentNode };
const RAMP_MS = 4000;
// The load test ramps from 0.1× to 10× the target users.
const RAMP_FROM = 0.1;
const RAMP_TO = 10;
const edgeTypes = { load: LoadEdge };

type SavedDesign = { nodes: DesignNode[]; edges: Edge[]; users: number };

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
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [rampUsers, setRampUsers] = useState<number | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [reportSignature, setReportSignature] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const togglePalette = useCallback((open: boolean) => {
    setPaletteOpen(open);
    try {
      localStorage.setItem("sdt:palette-open", String(open));
    } catch {}
  }, []);

  const scenario = SCENARIOS_BY_ID[scenarioId];

  const applyDesign = useCallback(
    (design: SavedDesign) => {
      setNodes(design.nodes);
      setEdges(design.edges);
      setUsers(design.users);
      setReport(null);
      setPreview(null);
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
    try {
      setPaletteOpen(localStorage.getItem("sdt:palette-open") !== "false");
    } catch {}
    setHydrated(true);
  }, [switchScenario]);

  useEffect(() => {
    if (hydrated) saveDesign(scenarioId, { nodes, edges, users });
  }, [hydrated, scenarioId, nodes, edges, users]);

  const graphNodes = useMemo(() => nodes.map((n) => ({ id: n.id, data: n.data })), [nodes]);
  const baseline = useMemo(() => simulate(graphNodes, edges, scenario, users), [graphNodes, edges, scenario, users]);
  const ramp = useMemo(
    () => (rampUsers === null ? null : simulate(graphNodes, edges, scenario, rampUsers)),
    [graphNodes, edges, scenario, rampUsers]
  );

  // Positions don't matter to a run; only what the components are and how they connect.
  const signature = useMemo(
    () => JSON.stringify([graphNodes.map((n) => [n.id, n.data]), edges.map((e) => [e.source, e.target]), users]),
    [graphNodes, edges, users]
  );
  const stale = report !== null && reportSignature !== signature;
  const previewed = !stale && preview ? report?.failures.find((f) => f.id === preview)?.simulation : null;
  const simulation = ramp ?? previewed ?? baseline;

  const startRun = useCallback(() => {
    setPreview(null);
    setReport(null);
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / RAMP_MS);
      setRampUsers(users * RAMP_FROM * Math.pow(RAMP_TO / RAMP_FROM, t));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setRampUsers(null);
        setReport(runTests(graphNodes, edges, scenario, users));
        setReportSignature(signature);
      }
    };
    requestAnimationFrame(tick);
  }, [graphNodes, edges, scenario, users, signature]);

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
    },
    [screenToFlowPosition, setNodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      setEdges((current) => addEdge({ ...connection, type: "load" }, current));
    },
    [setEdges]
  );

  return (
    <SimulationContext.Provider value={simulation}>
      <div className={`grid h-screen ${paletteOpen ? "grid-cols-[300px_1fr]" : "grid-cols-[1fr]"}`}>
        {/* Left sidebar */}
        {paletteOpen && (
          <aside className="flex min-h-0 flex-col border-r border-line bg-white">
            <Palette onAdd={(id) => addComponent(id)} onClose={() => togglePalette(false)} />
          </aside>
        )}

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
          {!paletteOpen && (
            <button
              onClick={() => togglePalette(true)}
              className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:text-ink"
            >
              <PanelLeftOpen className="size-4" /> Components
            </button>
          )}
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
            {rampUsers !== null && (
              <div className="w-56 rounded-lg border border-line bg-white px-3 py-1.5 shadow-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Load test</span>
                  <span className="font-medium">{formatNumber(rampUsers)} users</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-ink"
                    style={{ width: `${(Math.log(rampUsers / (users * RAMP_FROM)) / Math.log(RAMP_TO / RAMP_FROM)) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={startRun}
              disabled={rampUsers !== null}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white shadow-sm disabled:opacity-50"
            >
              <Play className="size-3.5 fill-current" /> {rampUsers !== null ? "Running…" : "Run"}
            </button>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "load" }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
          {report && rampUsers === null && (
            <RunDrawer
              report={report}
              stale={stale}
              preview={preview}
              onPreview={setPreview}
              onRerun={startRun}
              onClose={() => {
                setReport(null);
                setPreview(null);
              }}
            />
          )}
        </main>

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
