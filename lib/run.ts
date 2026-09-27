import { CATEGORY_LABELS, resolveItem, type Category } from "./catalog";
import type { Scenario } from "./scenarios";
import { nodeName, simulate, type GraphEdge, type GraphNode, type Simulation } from "./simulate";

export type Verdict = "survives" | "degraded" | "down";

export type Breakpoint = { nodeId: string; name: string; users: number };

export type FailureResult = {
  id: string;
  title: string;
  description: string;
  verdict: Verdict;
  detail: string;
  // Users the design had to serve in this scenario, and what it can serve now.
  demand: number;
  supportedUsers: number;
  // What the canvas shows when this scenario is selected.
  simulation: Simulation;
};

export type RunReport = {
  users: number;
  breakpoints: Breakpoint[];
  failures: FailureResult[];
};

const SPIKE_FACTOR = 10;
// AWS regions have at least three AZs, and Azure regions with zones have three
// (East US 2 has four), so multi-AZ components are spread over three zones.
const ZONES = 3;
const IGNORED: Category[] = ["client", "monitoring"];

function categoryOf(node: GraphNode): Category | null {
  return resolveItem(node.data.catalogId, { name: node.data.customName ?? "", category: node.data.customCategory ?? null })?.category ?? null;
}

/** Tiers (categories) that carry traffic in a simulation. */
function servingTiers(nodes: GraphNode[], sim: Simulation): Set<Category> {
  const tiers = new Set<Category>();
  for (const node of nodes) {
    const status = sim.nodes[node.id]?.status;
    const category = categoryOf(node);
    if (category && !IGNORED.includes(category) && status && !["idle", "down", "unclassified"].includes(status)) {
      tiers.add(category);
    }
  }
  return tiers;
}

function judge(
  baseline: Simulation,
  baseNodes: GraphNode[],
  after: Simulation,
  afterNodes: GraphNode[],
  demand: number
): { verdict: Verdict; detail: string } {
  const before = servingTiers(baseNodes, baseline);
  const remaining = servingTiers(afterNodes, after);
  // Losing a cache isn't an outage: reads fall through to the database, and the
  // re-simulation already charges that extra load. Anything behind the cache
  // that gets cut off still counts as lost.
  const lost = [...before].filter((tier) => tier !== "cache" && !remaining.has(tier));
  const cacheLost = before.has("cache") && !remaining.has("cache");
  const fallback = cacheLost ? "Cache lost, reads fall back to the database. " : "";
  if (lost.length > 0) {
    // Name what actually failed; the other lost tiers are just cut off behind it.
    const failed = afterNodes
      .filter((n) => n.data.failed && !["idle", "down"].includes(baseline.nodes[n.id]?.status ?? "idle"))
      .map((n) => nodeName(n.data));
    const cutOff = lost.filter((tier) => !afterNodes.some((n) => n.data.failed && categoryOf(n) === tier));
    const cause = failed.length ? `${failed.join(" and ")} went down` : `No ${lost.map((t) => CATEGORY_LABELS[t]).join(", ")} left`;
    const tail = cutOff.length ? `, cutting off ${cutOff.map((t) => CATEGORY_LABELS[t]).join(", ")}` : "";
    return { verdict: "down", detail: `${cause}${tail}. The system is down.` };
  }

  if (after.supportedUsers < demand) {
    const bottleneck = afterNodes.find((n) => n.id === after.bottleneckId);
    const util = bottleneck ? after.nodes[bottleneck.id].utilization : 0;
    return {
      verdict: "degraded",
      detail: `${fallback}Serves ~${formatUsers(after.supportedUsers)} of ${formatUsers(demand)} users. ${
        bottleneck ? `${nodeName(bottleneck.data)} at ${Math.round(util * 100)}%.` : ""
      }`,
    };
  }
  return { verdict: "survives", detail: `${fallback}Still serves up to ~${formatUsers(after.supportedUsers)} users.` };
}

function formatUsers(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(Math.round(value));
}

function isSelfManaged(node: GraphNode): boolean {
  const item = resolveItem(node.data.catalogId, { name: node.data.customName ?? "", category: node.data.customCategory ?? null });
  return !!item && !item.managed && !IGNORED.includes(item.category);
}

/**
 * Stress-tests a design with the same capacity model the canvas uses:
 * where it breaks as traffic grows, and what happens under common failures.
 */
export function runTests(nodes: GraphNode[], edges: GraphEdge[], scenario: Scenario, users: number): RunReport {
  const baseline = simulate(nodes, edges, scenario, users);

  const breakpoints = nodes
    .filter((n) => {
      const sim = baseline.nodes[n.id];
      return sim && !["idle", "down", "unclassified"].includes(sim.status) && Number.isFinite(sim.supportedUsers);
    })
    .map((n) => ({ nodeId: n.id, name: nodeName(n.data), users: baseline.nodes[n.id].supportedUsers }))
    .sort((a, b) => a.users - b.users)
    .slice(0, 5);

  const failures: FailureResult[] = [];
  const scenarioResult = (
    id: string,
    title: string,
    description: string,
    afterNodes: GraphNode[],
    demand = users
  ): FailureResult => {
    const after = simulate(afterNodes, edges, scenario, demand);
    return { id, title, description, demand, supportedUsers: after.supportedUsers, simulation: after, ...judge(baseline, nodes, after, afterNodes, demand) };
  };

  // Zone outage: single-AZ components are assumed to live in the failed zone.
  // Multi-AZ ones are spread over the zones and lose the units in the fullest one,
  // ceil(units / 3); a single multi-AZ unit fails over to its standby.
  failures.push(
    scenarioResult(
      "az-outage",
      "Availability zone outage",
      `One of ${ZONES} AZs goes dark. Single-AZ components die; multi-AZ ones lose the units in that zone (up to a third).`,
      nodes.map((n) => {
        if (!isSelfManaged(n)) return n;
        if (!n.data.multiAz) return { ...n, data: { ...n.data, failed: true } };
        return { ...n, data: { ...n.data, units: Math.max(1, n.data.units - Math.ceil(n.data.units / ZONES)) } };
      })
    )
  );

  // Worst single failure: lose one unit of each self-managed component in turn.
  const candidates = nodes.filter((n) => isSelfManaged(n) && baseline.nodes[n.id]?.status !== "idle");
  const singles = candidates.map((victim) => {
    const afterNodes = nodes.map((n) => {
      if (n.id !== victim.id) return n;
      if (n.data.units > 1) return { ...n, data: { ...n.data, units: n.data.units - 1 } };
      // A single multi-AZ unit fails over to its standby.
      return n.data.multiAz ? n : { ...n, data: { ...n.data, failed: true } };
    });
    return scenarioResult(
      "single-failure",
      "Worst single failure",
      `One ${nodeName(victim.data)} ${victim.data.units > 1 ? "instance" : "node"} crashes.`,
      afterNodes
    );
  });
  const rank: Record<Verdict, number> = { down: 0, degraded: 1, survives: 2 };
  const worst = singles.sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.supportedUsers - b.supportedUsers)[0];
  if (worst) failures.push(worst);

  const hasCache = nodes.some((n) => categoryOf(n) === "cache" && !n.data.failed);
  if (hasCache) {
    failures.push(
      scenarioResult(
        "cold-cache",
        "Cache restarts cold",
        "The cache is flushed: every read misses and goes to the database until it warms up.",
        nodes.map((n) => (categoryOf(n) === "cache" ? { ...n, data: { ...n.data, hitRate: 0 } } : n))
      )
    );
  }

  failures.push(
    scenarioResult(
      "spike",
      `${SPIKE_FACTOR}× traffic spike`,
      "A launch or viral moment brings ten times the usual users at peak.",
      nodes,
      users * SPIKE_FACTOR
    )
  );

  return { users, breakpoints, failures };
}

export { formatUsers };
