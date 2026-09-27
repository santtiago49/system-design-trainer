import type { Edge } from "@xyflow/react";
import { nanoid } from "nanoid";
import type { DesignNode } from "@/components/component-node";
import type { LineNode, TextNode } from "@/components/annotations";
import { CATALOG_BY_ID } from "./catalog";
import { SCENARIOS, SCENARIOS_BY_ID, type Scenario } from "./scenarios";
import { LEVELS_BY_ID } from "./levels";
import { layout, monitoringPosition, type AzureImport } from "./azure-import";

// What the whiteboard is showing (free play, a level, an imported subscription) and
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
  | { kind: "level"; levelId: string }
  | { kind: "azure"; subscriptionId: string };

export const SANDBOX: Workspace = { kind: "sandbox", scenarioId: SCENARIOS[0].id };

export function workspaceScenario(workspace: Workspace): Scenario {
  if (workspace.kind === "level") return LEVELS_BY_ID[workspace.levelId].scenario;
  // An imported subscription has no scenario of its own; the traffic profile of a
  // typical web app stands in until real metrics arrive, with users editable.
  if (workspace.kind === "azure") return SCENARIOS_BY_ID["web-1m"];
  return SCENARIOS_BY_ID[workspace.scenarioId];
}

export function designKey(workspace: Workspace): string {
  if (workspace.kind === "level") return `sdt:design:level:${workspace.levelId}`;
  if (workspace.kind === "azure") return `sdt:design:azure:${workspace.subscriptionId}`;
  return `sdt:design:${workspace.scenarioId}`;
}

export const importKey = (subscriptionId: string) => `sdt:azure-import:${subscriptionId}`;

export function loadImport(subscriptionId: string): AzureImport | null {
  try {
    const raw = localStorage.getItem(importKey(subscriptionId));
    return raw ? (JSON.parse(raw) as AzureImport) : null;
  } catch {
    return null;
  }
}

/** Canvas design for an imported subscription: its resources in tier columns plus a Users node. */
export function azureDesign(result: AzureImport, users: number): SavedDesign {
  const ids = new Map<string, string>();
  const nodes: AppNode[] = [newNode("users", { x: -300, y: 0 })];
  const placed = layout(result.resources);
  for (const r of placed) {
    const node = newNode(r.catalogId, r.position);
    node.data = { ...node.data, units: r.units, multiAz: r.multiAz, azure: { id: r.azureId, name: r.name, resourceGroup: r.resourceGroup, sku: r.sku } };
    ids.set(r.azureId, node.id);
    nodes.push(node);
  }
  if (result.monitoring > 0) {
    const node = newNode("az-monitor", monitoringPosition(placed));
    node.data = { ...node.data, azure: { id: "monitoring", name: `Monitoring (${result.monitoring} resources)`, resourceGroup: "", sku: null } };
    nodes.push(node);
  }
  const edges: Edge[] = result.edges.flatMap((e) => {
    const source = ids.get(e.source), target = ids.get(e.target);
    return source && target ? [{ id: `${source}-${target}`, source, target, type: "load" }] : [];
  });
  return { nodes, edges, users };
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
        workspace.kind === "level"
          ? LEVELS_BY_ID[workspace.levelId]
          : workspace.kind === "azure"
            ? loadImport(workspace.subscriptionId)
            : SCENARIOS_BY_ID[workspace.scenarioId];
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

/** Stores a fresh import and lays it out as the subscription's design, replacing the previous one. */
export function storeAzureImport(result: AzureImport): Workspace {
  const workspace: Workspace = { kind: "azure", subscriptionId: result.subscriptionId };
  try {
    localStorage.setItem(importKey(result.subscriptionId), JSON.stringify(result));
    localStorage.setItem(designKey(workspace), JSON.stringify(azureDesign(result, SCENARIOS_BY_ID["web-1m"].dailyActiveUsers)));
  } catch {}
  selectWorkspace(workspace);
  return workspace;
}

/** Subscriptions imported before, newest first. */
export function importedSubscriptions(): AzureImport[] {
  const found: AzureImport[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sdt:azure-import:")) {
        const result = loadImport(key.slice("sdt:azure-import:".length));
        if (result) found.push(result);
      }
    }
  } catch {}
  return found.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

/** Runs an import on the server with the signed-in user's token. */
export async function fetchAzureImport(subscriptionId: string): Promise<AzureImport> {
  const res = await fetch("/api/azure/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Import failed");
  return data as AzureImport;
}
