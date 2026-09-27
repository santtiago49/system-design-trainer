import type { Edge } from "@xyflow/react";
import { nanoid } from "nanoid";
import type { DesignNode } from "@/components/component-node";
import type { LineNode, TextNode } from "@/components/annotations";
import { CATALOG_BY_ID } from "./catalog";
import { SCENARIOS, SCENARIOS_BY_ID, type Scenario } from "./scenarios";
import { LEVELS_BY_ID } from "./levels";

// What the whiteboard is showing (free play or a level) and
// the designs it keeps per place, in the browser. Shared by every page of the app.

export type AppNode = DesignNode | LineNode | TextNode;
export type SavedDesign = { nodes: AppNode[]; edges: Edge[]; users: number };

export const isComponent = (node: AppNode): node is DesignNode => node.type === "component";

export function newNode(catalogId: string, position: { x: number; y: number }): DesignNode {
  const item = CATALOG_BY_ID[catalogId];
  return {
    id: nanoid(8),
    type: "component",
    position,
    data: { catalogId, units: item?.defaultUnits ?? 1, multiAz: false, hitRate: 0.8, customName: "", customCategory: null },
  };
}

export type Workspace =
  | { kind: "sandbox"; scenarioId: string }
  | { kind: "level"; levelId: string };

export const SANDBOX: Workspace = { kind: "sandbox", scenarioId: SCENARIOS[0].id };

export function workspaceScenario(workspace: Workspace): Scenario {
  if (workspace.kind === "level") return LEVELS_BY_ID[workspace.levelId].scenario;
  return SCENARIOS_BY_ID[workspace.scenarioId];
}

export function designKey(workspace: Workspace): string {
  if (workspace.kind === "level") return `sdt:design:level:${workspace.levelId}`;
  return `sdt:design:${workspace.scenarioId}`;
}

export function emptyDesign(scenario: Scenario): SavedDesign {
  return {
    nodes: [newNode("users", { x: 0, y: 160 })],
    edges: [],
    users: scenario.dailyActiveUsers,
  };
}

export function loadDesign(workspace: Workspace): SavedDesign {
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

export function saveDesign(workspace: Workspace, design: SavedDesign) {
  try {
    localStorage.setItem(designKey(workspace), JSON.stringify(design));
    localStorage.setItem("sdt:workspace", JSON.stringify(workspace));
  } catch {}
}

export function loadWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem("sdt:workspace");
    if (raw) {
      const workspace = JSON.parse(raw) as Workspace;
      const valid =
        workspace.kind === "level" ? LEVELS_BY_ID[workspace.levelId] : SCENARIOS_BY_ID[workspace.scenarioId];
      if (valid) return workspace;
    }
    // Designs saved before levels existed.
    const legacy = localStorage.getItem("sdt:scenario");
    if (legacy && SCENARIOS_BY_ID[legacy]) return { kind: "sandbox", scenarioId: legacy };
  } catch {}
  return null;
}

/** Makes the whiteboard open this workspace next time it loads. */
export function selectWorkspace(workspace: Workspace) {
  try {
    localStorage.setItem("sdt:workspace", JSON.stringify(workspace));
  } catch {}
}
