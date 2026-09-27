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
  type XYPosition,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { Map as MapIcon, PanelLeftOpen, Play } from "lucide-react";
import { CATALOG_BY_ID } from "@/lib/catalog";
import { SCENARIOS, SCENARIOS_BY_ID, type Scenario } from "@/lib/scenarios";
import { evaluateLevel, LEVELS_BY_ID, nextLevel, type LevelResult } from "@/lib/levels";
import { loadProgress, rankFor, recordStars, saveProgress, totalXp, type Progress } from "@/lib/progress";
import { formatNumber, simulate, type DesignNodeData } from "@/lib/simulate";
import { runTests, type RunReport } from "@/lib/run";
import { ComponentNode, type DesignNode } from "./component-node";
import { createLine, createText, LineNodeView, TextNodeView, type LineNode, type TextData, type TextNode } from "./annotations";
import { CanvasToolbar, TOOL_SHORTCUTS, type Tool } from "./canvas-toolbar";
import { LoadEdge } from "./load-edge";
import { DRAG_TYPE, Palette } from "./palette";
import { DesignActionsContext } from "./design-actions";
import { RunDrawer } from "./run-drawer";
import { LevelHud } from "./level-hud";
import { LevelResultModal } from "./level-result";
import { LevelSelect } from "./level-select";
import { SimulationContext } from "./simulation-context";

const nodeTypes = { component: ComponentNode, line: LineNodeView, text: TextNodeView };
const RAMP_MS = 4000;
// The load test ramps from 0.1× to 10× the target users.
const RAMP_FROM = 0.1;
const RAMP_TO = 10;
const edgeTypes = { load: LoadEdge };

type AppNode = DesignNode | LineNode | TextNode;
type SavedDesign = { nodes: AppNode[]; edges: Edge[]; users: number };

const isComponent = (node: AppNode): node is DesignNode => node.type === "component";

/** True when a key press is meant for a text field, not a canvas shortcut. */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

function newNode(catalogId: string, position: { x: number; y: number }): DesignNode {
  const item = CATALOG_BY_ID[catalogId];
  return {
    id: nanoid(8),
    type: "component",
    position,
    data: { catalogId, units: item?.defaultUnits ?? 1, multiAz: false, hitRate: 0.8, customName: "", customCategory: null },
  };
}

type Workspace = { kind: "sandbox"; scenarioId: string } | { kind: "level"; levelId: string };

const SANDBOX: Workspace = { kind: "sandbox", scenarioId: SCENARIOS[0].id };

function workspaceScenario(workspace: Workspace): Scenario {
  return workspace.kind === "level" ? LEVELS_BY_ID[workspace.levelId].scenario : SCENARIOS_BY_ID[workspace.scenarioId];
}

function designKey(workspace: Workspace): string {
  return workspace.kind === "level" ? `sdt:design:level:${workspace.levelId}` : `sdt:design:${workspace.scenarioId}`;
}

function emptyDesign(scenario: Scenario): SavedDesign {
  return {
    nodes: [newNode("users", { x: 0, y: 160 })],
    edges: [],
    users: scenario.dailyActiveUsers,
  };
}

function loadDesign(workspace: Workspace): SavedDesign {
  const scenario = workspaceScenario(workspace);
  try {
    const raw = localStorage.getItem(designKey(workspace));
    if (raw) {
      const design = JSON.parse(raw) as SavedDesign;
      // Selection is session state; restoring it would reopen a properties card on load.
      // Empty notes are abandoned drafts.
      const nodes = design.nodes.filter((n) => n.type !== "text" || n.data.text.trim());
      // Levels fix the number of users.
      const users = workspace.kind === "level" ? scenario.dailyActiveUsers : design.users;
      return { ...design, users, nodes: nodes.map((n) => ({ ...n, selected: false })) };
    }
  } catch {}
  return emptyDesign(scenario);
}

function saveDesign(workspace: Workspace, design: SavedDesign) {
  try {
    localStorage.setItem(designKey(workspace), JSON.stringify(design));
    localStorage.setItem("sdt:workspace", JSON.stringify(workspace));
  } catch {}
}

function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem("sdt:workspace");
    if (raw) {
      const workspace = JSON.parse(raw) as Workspace;
      if (workspace.kind === "level" ? LEVELS_BY_ID[workspace.levelId] : SCENARIOS_BY_ID[workspace.scenarioId]) return workspace;
    }
    // Designs saved before levels existed.
    const legacy = localStorage.getItem("sdt:scenario");
    if (legacy && SCENARIOS_BY_ID[legacy]) return { kind: "sandbox", scenarioId: legacy };
  } catch {}
  return null;
}

type ResultState = { result: LevelResult; xpGained: number; rankUp: string | null };

function Board() {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [workspace, setWorkspace] = useState<Workspace>(SANDBOX);
  const [hydrated, setHydrated] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [users, setUsers] = useState(SCENARIOS[0].dailyActiveUsers);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [rampUsers, setRampUsers] = useState<number | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [reportSignature, setReportSignature] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Line being drawn, in canvas-relative screen pixels for the preview and flow coordinates for the result.
  const [draft, setDraft] = useState<{ start: XYPosition; end: XYPosition; flowStart: XYPosition } | null>(null);
  const [progress, setProgress] = useState<Progress>({ stars: {} });
  const [showLevels, setShowLevels] = useState(false);
  const [levelEval, setLevelEval] = useState<LevelResult | null>(null);
  const [resultModal, setResultModal] = useState<ResultState | null>(null);

  const togglePalette = useCallback((open: boolean) => {
    setPaletteOpen(open);
    try {
      localStorage.setItem("sdt:palette-open", String(open));
    } catch {}
  }, []);

  const level = workspace.kind === "level" ? LEVELS_BY_ID[workspace.levelId] : null;
  const scenario = workspaceScenario(workspace);

  const applyDesign = useCallback(
    (design: SavedDesign) => {
      setNodes(design.nodes);
      setEdges(design.edges);
      setUsers(design.users);
      setReport(null);
      setPreview(null);
      setLevelEval(null);
      setResultModal(null);
    },
    [setNodes, setEdges]
  );

  const openWorkspace = useCallback(
    (next: Workspace) => {
      setWorkspace(next);
      applyDesign(loadDesign(next));
      setShowLevels(false);
      requestAnimationFrame(() => fitView({ maxZoom: 1, padding: 0.15 }));
    },
    [applyDesign, fitView]
  );

  useEffect(() => {
    const saved = loadWorkspace();
    openWorkspace(saved ?? SANDBOX);
    setProgress(loadProgress());
    // First visit: start at the level map.
    if (!saved) setShowLevels(true);
    try {
      setPaletteOpen(localStorage.getItem("sdt:palette-open") !== "false");
    } catch {}
    setHydrated(true);
  }, [openWorkspace]);

  useEffect(() => {
    if (hydrated) saveDesign(workspace, { nodes, edges, users });
  }, [hydrated, workspace, nodes, edges, users]);

  const graphNodes = useMemo(() => nodes.filter(isComponent).map((n) => ({ id: n.id, data: n.data })), [nodes]);
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
        const nextReport = runTests(graphNodes, edges, scenario, users);
        setReport(nextReport);
        setReportSignature(signature);
        if (level) {
          const result = evaluateLevel(level, { nodes: graphNodes, edges, baseline, report: nextReport });
          setLevelEval(result);
          const recorded = recordStars(progress, level.id, result.stars);
          saveProgress(recorded.progress);
          setProgress(recorded.progress);
          const before = rankFor(totalXp(progress)).title;
          const after = rankFor(totalXp(recorded.progress)).title;
          setResultModal({ result, xpGained: recorded.xpGained, rankUp: after !== before ? after : null });
        }
      }
    };
    requestAnimationFrame(tick);
  }, [graphNodes, edges, scenario, users, signature, level, baseline, progress]);

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

  const updateNode = useCallback(
    (id: string, patch: Partial<DesignNodeData>) => {
      setNodes((current) => current.map((n) => (n.id === id && isComponent(n) ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes]
  );

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<TextData>) => {
      setNodes((current) => current.map((n) => (n.id === id && n.type === "text" ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((current) => current.filter((n) => n.id !== id));
      setEdges((current) => current.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges]
  );

  // Tool shortcuts (V/H/L/T), Esc to deselect, and holding Space for the hand.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      if (event.key === "Escape") {
        setTool("select");
        setDraft(null);
        setNodes((current) => current.map((n) => (n.selected ? { ...n, selected: false } : n)));
      } else if (event.code === "Space") {
        event.preventDefault();
        setSpaceHeld(true);
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && TOOL_SHORTCUTS[event.key.toLowerCase()]) {
        setTool(TOOL_SHORTCUTS[event.key.toLowerCase()]);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [setNodes]);

  const panning = tool === "hand" || spaceHeld;
  const drawing = (tool === "line" || tool === "text") && !spaceHeld;

  const localPoint = (event: React.PointerEvent): XYPosition => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onDrawStart = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (tool === "text") {
      // Keep the click from moving focus away from the note's text box.
      event.preventDefault();
      setNodes((current) => [...current.map((n) => ({ ...n, selected: false })), createText(flow)]);
      setTool("select");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    setDraft({ start: point, end: point, flowStart: flow });
  };

  const onDrawMove = (event: React.PointerEvent) => {
    if (draft) setDraft({ ...draft, end: localPoint(event) });
  };

  const onDrawEnd = (event: React.PointerEvent) => {
    if (!draft) return;
    const flowEnd = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // Ignore clicks that barely moved.
    if (Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) > 4) {
      setNodes((current) => [...current, createLine(draft.flowStart, flowEnd)]);
      setTool("select");
    }
    setDraft(null);
  };

  const actions = useMemo(
    () => ({ users, usersLocked: level !== null, setUsers: level ? () => {} : setUsers, updateNode, updateAnnotation, deleteNode }),
    [users, level, updateNode, updateAnnotation, deleteNode]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      setEdges((current) => addEdge({ ...connection, type: "load" }, current));
    },
    [setEdges]
  );

  return (
    <DesignActionsContext.Provider value={actions}>
      <SimulationContext.Provider value={simulation}>
        <div className={`relative grid h-screen ${paletteOpen ? "grid-cols-[300px_1fr]" : "grid-cols-[1fr]"}`}>
          {/* Left sidebar */}
          {paletteOpen && (
            <aside className="flex min-h-0 flex-col border-r border-line bg-white">
              <Palette
                key={level?.provider ?? "aws"}
                initialProvider={level?.provider ?? "aws"}
                onAdd={(id) => addComponent(id)}
                onClose={() => togglePalette(false)}
              />
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
            <div className="absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
              {!paletteOpen && (
                <button
                  onClick={() => togglePalette(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:text-ink"
                >
                  <PanelLeftOpen className="size-4" /> Components
                </button>
              )}
              {hydrated && level ? (
                <LevelHud
                  key={level.id}
                  level={level}
                  bestStars={progress.stars[level.id] ?? 0}
                  result={levelEval}
                  stale={stale}
                  onOpenLevels={() => setShowLevels(true)}
                  onReset={() => applyDesign(emptyDesign(level.scenario))}
                />
              ) : (
                hydrated && (
                  <button
                    onClick={() => setShowLevels(true)}
                    className="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:text-ink"
                  >
                    <MapIcon className="size-4" /> Levels · free play
                  </button>
                )
              )}
            </div>
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <CanvasToolbar tool={spaceHeld ? "hand" : tool} onChange={setTool} />
            </div>
            <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
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
              // Select: drag on empty canvas to box-select, middle mouse pans. Hand (or Space): drag pans.
              panOnDrag={panning ? true : [1]}
              selectionOnDrag={!panning}
              nodesDraggable={!panning}
              nodesConnectable={!panning}
              elementsSelectable={!panning}
              className={panning ? "cursor-grab active:cursor-grabbing" : undefined}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} color="#d9d8d2" />
              <Controls showInteractive={false} />
              {/* The minimap panel sits above the properties card, so it steps aside while one is open. */}
              {!nodes.some((n) => n.selected && isComponent(n)) && <MiniMap pannable zoomable className="!bg-white" />}
            </ReactFlow>
            {drawing && (
              <div
                className={`absolute inset-0 z-10 ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
                onPointerDown={onDrawStart}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawEnd}
              >
                {draft && (
                  <svg className="pointer-events-none absolute inset-0 size-full">
                    <line x1={draft.start.x} y1={draft.start.y} x2={draft.end.x} y2={draft.end.y} stroke="#52525b" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                )}
              </div>
            )}
            {nodes.filter(isComponent).length <= 1 && (
              <div className="pointer-events-none absolute inset-x-0 top-20 text-center text-sm text-zinc-400">
                Drag components from the left, then connect them starting from Users.
              </div>
            )}
            {level && resultModal && (
              <LevelResultModal
                level={level}
                result={resultModal.result}
                xpGained={resultModal.xpGained}
                rankUp={resultModal.rankUp}
                nextLevel={nextLevel(level.id)}
                onNext={() => {
                  const next = nextLevel(level.id);
                  if (next) openWorkspace({ kind: "level", levelId: next.id });
                }}
                onClose={() => setResultModal(null)}
              />
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

          {showLevels && (
            <LevelSelect
              progress={progress}
              currentLevelId={level?.id ?? null}
              onPlay={(levelId) => openWorkspace({ kind: "level", levelId })}
              onFreePlay={() => openWorkspace(SANDBOX)}
              onClose={() => setShowLevels(false)}
            />
          )}
  
        </div>
      </SimulationContext.Provider>
    </DesignActionsContext.Provider>
  );
}

export function Whiteboard() {
  return (
    <ReactFlowProvider>
      <Board />
    </ReactFlowProvider>
  );
}
