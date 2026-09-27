import { CATEGORY_LABELS, resolveItem, type CatalogItem, type Category } from "./catalog";
import { peakRps, type Scenario } from "./scenarios";

export type DesignNodeData = {
  catalogId: string;
  units: number;
  multiAz: boolean;
  // Cache hit rate, only used by cache nodes.
  hitRate: number;
  customName?: string;
  customCategory?: Category | null;
  classification?: { confidence: number; mock: boolean } | null;
  classifying?: boolean;
  // Set by failure scenarios: the component is down and carries no traffic.
  failed?: boolean;
};

export type GraphNode = { id: string; data: DesignNodeData };
export type GraphEdge = { id: string; source: string; target: string };

export type Load = { reads: number; writes: number };

export type NodeStatus = "idle" | "ok" | "warn" | "over" | "unclassified" | "down";

export type NodeSim = {
  status: NodeStatus;
  load: Load;
  capacity: number;
  utilization: number;
  supportedUsers: number;
  availability: number;
};

export type Finding = {
  severity: "error" | "warn" | "info";
  message: string;
  nodeId?: string;
};

export type Simulation = {
  users: number;
  peakRps: number;
  nodes: Record<string, NodeSim>;
  edges: Record<string, number>;
  supportedUsers: number;
  bottleneckId: string | null;
  availability: number;
  monthlyCost: number;
  findings: Finding[];
};

const DATA_STORES: Category[] = ["sqlDb", "nosqlDb", "search"];
const PASSIVE: Category[] = ["client", "monitoring"];

const add = (a: Load, b: Load): Load => ({ reads: a.reads + b.reads, writes: a.writes + b.writes });
const scale = (a: Load, k: number): Load => ({ reads: a.reads * k, writes: a.writes * k });
const total = (a: Load) => a.reads + a.writes;
const ZERO: Load = { reads: 0, writes: 0 };

export function nodeName(data: DesignNodeData): string {
  const item = resolveItem(data.catalogId, { name: data.customName ?? "", category: data.customCategory ?? null });
  return item?.name ?? data.customName ?? "Custom component";
}

function unitAvailability(item: CatalogItem, data: DesignNodeData): number {
  // Published SLAs only distinguish single-AZ from multi-AZ deployments, so the
  // number of units in one zone doesn't change the committed uptime.
  if (item.managed || !data.multiAz) return item.sla;
  return item.slaMultiAz ?? item.sla;
}

/** What a node lets through to its children after doing its own work. */
function passThrough(item: CatalogItem, data: DesignNodeData, load: Load, scenario: Scenario): Load {
  switch (item.category) {
    case "cdn":
      return scale(load, 1 - scenario.cacheableAtEdge);
    case "cache":
      return { reads: load.reads * (1 - data.hitRate), writes: load.writes };
    case "queue":
      // Consumers drain at the average rate, not the peak.
      return scale(load, 1 / scenario.peakFactor);
    case "monitoring":
      return ZERO;
    default:
      return load;
  }
}

/**
 * Deterministic capacity model: pushes the scenario's peak load from the Users
 * nodes through the graph and measures how close each component is to its limit.
 * Load scales linearly with users, so "supported users" is users / utilization.
 */
export function simulate(
  nodes: GraphNode[],
  edges: GraphEdge[],
  scenario: Scenario,
  users: number
): Simulation {
  const items = new Map<string, CatalogItem>();
  for (const node of nodes) {
    if (node.data.failed) continue;
    const item = resolveItem(node.data.catalogId, {
      name: node.data.customName ?? "",
      category: node.data.customCategory ?? null,
    });
    if (item) items.set(node.id, item);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (!items.has(edge.source) || !items.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  const sources = nodes.filter((n) => items.get(n.id)?.category === "client");

  // Reachability from traffic sources.
  const reachable = new Set<string>(sources.map((s) => s.id));
  const stack = [...reachable];
  while (stack.length) {
    const id = stack.pop()!;
    for (const edge of outgoing.get(id) ?? []) {
      if (!reachable.has(edge.target)) {
        reachable.add(edge.target);
        stack.push(edge.target);
      }
    }
  }

  // Topological order over the reachable subgraph; nodes stuck in cycles go last.
  const indegree = new Map<string, number>([...reachable].map((id) => [id, 0]));
  for (const id of reachable) {
    for (const edge of outgoing.get(id) ?? []) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }
  const order: string[] = [];
  const queue = [...reachable].filter((id) => indegree.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const next = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, next);
      if (next === 0) queue.push(edge.target);
    }
  }
  for (const id of reachable) if (!order.includes(id)) order.push(id);

  const peak = peakRps(scenario, users);
  const incoming = new Map<string, Load>();
  for (const source of sources) {
    incoming.set(source.id, {
      reads: (peak * scenario.readRatio) / sources.length,
      writes: (peak * (1 - scenario.readRatio)) / sources.length,
    });
  }

  const edgeLoad: Record<string, number> = {};
  const visited = new Set<string>();

  for (const id of order) {
    if (visited.has(id)) continue;
    visited.add(id);
    const item = items.get(id)!;
    const data = byId.get(id)!.data;
    const pass = passThrough(item, data, incoming.get(id) ?? ZERO, scenario);

    const children = (outgoing.get(id) ?? []).filter((e) => !visited.has(e.target));
    const groups = new Map<Category, GraphEdge[]>();
    for (const edge of children) {
      const category = items.get(edge.target)!.category;
      groups.set(category, [...(groups.get(category) ?? []), edge]);
    }

    // Cache-aside: sibling caches absorb reads before they reach data stores.
    const cacheHit = Math.max(
      0,
      ...(groups.get("cache") ?? []).map((e) => byId.get(e.target)!.data.hitRate)
    );
    // Async writes: a sibling queue takes the writes off the synchronous path.
    const hasQueue = groups.has("queue");

    for (const [category, group] of groups) {
      let load = pass;
      if (DATA_STORES.includes(category)) {
        load = { reads: load.reads * (1 - cacheHit), writes: hasQueue ? 0 : load.writes };
      } else if (category === "cache" && item.category !== "cache") {
        load = { reads: load.reads, writes: 0 };
      } else if (category === "queue") {
        load = { reads: 0, writes: load.writes };
      } else if (PASSIVE.includes(category)) {
        load = ZERO;
      }
      const share = scale(load, 1 / group.length);
      for (const edge of group) {
        edgeLoad[edge.id] = total(share);
        incoming.set(edge.target, add(incoming.get(edge.target) ?? ZERO, share));
      }
    }
  }

  const sims: Record<string, NodeSim> = {};
  let supportedUsers = sources.length ? Infinity : 0;
  let bottleneckId: string | null = null;
  let availability = 1;
  let monthlyCost = 0;

  for (const node of nodes) {
    const item = items.get(node.id);
    const data = node.data;
    if (data.failed) {
      sims[node.id] = { status: "down", load: ZERO, capacity: 0, utilization: 0, supportedUsers: Infinity, availability: 0 };
      continue;
    }
    if (!item) {
      sims[node.id] = { status: "unclassified", load: ZERO, capacity: 0, utilization: 0, supportedUsers: Infinity, availability: 1 };
      continue;
    }
    monthlyCost += item.monthlyCost * data.units;

    const load = incoming.get(node.id) ?? ZERO;
    const readCap = item.unitRps * data.units;
    const writeCap = (item.unitWriteRps ?? item.unitRps) * (item.writesScale === false ? 1 : data.units);
    const utilization = item.unitWriteRps
      ? Math.max(load.reads / readCap, load.writes / writeCap)
      : total(load) / readCap;
    const nodeSupported = utilization > 0 ? users / utilization : Infinity;
    const nodeAvailability = unitAvailability(item, data);

    const isReachable = reachable.has(node.id);
    let status: NodeStatus = "idle";
    if (isReachable) {
      status = utilization >= 1 ? "over" : utilization >= 0.7 ? "warn" : "ok";
      if (item.category !== "monitoring") availability *= nodeAvailability;
      if (nodeSupported < supportedUsers) {
        supportedUsers = nodeSupported;
        bottleneckId = node.id;
      }
    }

    sims[node.id] = {
      status,
      load,
      capacity: readCap,
      utilization: Number.isFinite(utilization) ? utilization : 0,
      supportedUsers: nodeSupported,
      availability: nodeAvailability,
    };
  }

  return {
    users,
    peakRps: peak,
    nodes: sims,
    edges: edgeLoad,
    supportedUsers,
    bottleneckId,
    availability: sources.length ? availability : 0,
    monthlyCost,
    findings: findings(nodes, edges, items, reachable, sims, scenario, availability, sources.length),
  };
}

function findings(
  nodes: GraphNode[],
  edges: GraphEdge[],
  items: Map<string, CatalogItem>,
  reachable: Set<string>,
  sims: Record<string, NodeSim>,
  scenario: Scenario,
  availability: number,
  sourceCount: number
): Finding[] {
  const result: Finding[] = [];
  const name = (id: string) => nodeName(nodes.find((n) => n.id === id)!.data);

  if (sourceCount === 0) {
    result.push({ severity: "error", message: "Add a Users node: it is where traffic enters the system." });
    return result;
  }

  for (const node of nodes) {
    if (node.data.failed) continue;
    const item = items.get(node.id);
    const sim = sims[node.id];
    if (!item) {
      result.push({ severity: "info", nodeId: node.id, message: `"${name(node.id)}" is not classified yet, so it carries no load.` });
      continue;
    }
    if (item.category === "client") continue;
    if (!reachable.has(node.id)) {
      result.push({ severity: "info", nodeId: node.id, message: `${item.name} is not connected to the traffic path.` });
      continue;
    }
    if (sim.status === "over") {
      result.push({
        severity: "error",
        nodeId: node.id,
        message: `${item.name} runs at ${Math.round(sim.utilization * 100)}% of capacity at peak. Add ${item.unitLabel || "capacity"} or offload traffic before it.`,
      });
    }
    if (!item.managed && node.data.units < 2 && !node.data.multiAz) {
      result.push({ severity: "warn", nodeId: node.id, message: `${item.name} is a single point of failure (1 unit, single AZ).` });
    } else if (!item.managed && ["sqlDb", "cache"].includes(item.category) && !node.data.multiAz) {
      result.push({ severity: "warn", nodeId: node.id, message: `${item.name} is stateful but not multi-AZ: an AZ outage loses it.` });
    }
  }

  for (const edge of edges) {
    const source = items.get(edge.source);
    const target = items.get(edge.target);
    if (source?.category === "client" && target && DATA_STORES.includes(target.category)) {
      result.push({ severity: "error", nodeId: edge.target, message: `Clients talk to ${target.name} directly. Put an application tier in between.` });
    }
    if (
      (source?.category === "client" || source?.category === "dns") &&
      target?.category === "compute" &&
      (nodes.find((n) => n.id === edge.target)?.data.units ?? 1) > 1
    ) {
      result.push({ severity: "warn", nodeId: edge.target, message: `Nothing balances traffic across the ${target.name} instances. Add a load balancer.` });
    }
  }

  if (availability < scenario.targetAvailability) {
    result.push({
      severity: "warn",
      message: `Estimated availability ${formatPercent(availability)} is below the ${formatPercent(scenario.targetAvailability)} target.`,
    });
  }

  if (![...items.values()].some((i) => i.category === "monitoring")) {
    result.push({ severity: "info", message: "No observability: how would you know it is failing?" });
  }

  const order = { error: 0, warn: 1, info: 2 };
  return result.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1)}k`;
  return value.toFixed(value < 10 && value > 0 ? 1 : 0);
}

export function formatPercent(value: number): string {
  // Up to three decimals, without trailing zeros: 99.5%, 99.95%, 99.995%, 100%.
  return `${parseFloat((value * 100).toFixed(3))}%`;
}

export { CATEGORY_LABELS };
