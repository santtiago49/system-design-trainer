import { resolveItem, type Category } from "./catalog";
import type { RunReport } from "./run";
import { SCENARIOS_BY_ID, type Scenario } from "./scenarios";
import type { GraphEdge, GraphNode, Simulation } from "./simulate";

export type CheckContext = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  baseline: Simulation;
  report: RunReport;
};

export type Objective = {
  id: string;
  label: string;
  check: (ctx: CheckContext) => boolean;
  // Set on budget objectives so the UI can show the limit next to the current cost.
  budget?: number;
};

export type Level = {
  id: string;
  chapter: number;
  title: string;
  brief: string;
  scenario: Scenario;
  // All required objectives earn the first star; each bonus earns one more.
  required: Objective[];
  bonus: [Objective, Objective];
  hints: string[];
  // Levels drawn from the Azure Architecture Center link to the official article.
  reference?: { title: string; url: string };
  provider?: "azure";
};

export const CHAPTERS = [
  { number: 1, title: "Foundations", blurb: "Serve traffic, spread load, keep state." },
  { number: 2, title: "Scale", blurb: "Caches, the edge and a production-ready million." },
  { number: 3, title: "Real systems", blurb: "Spikes, real-time and extreme read loads." },
  { number: 4, title: "Azure Architecture Center", blurb: "Rebuild Microsoft's reference architectures, then compare with the original." },
];

/* -------------------------------------------------------------------------- */
/*                              Objective helpers                             */
/* -------------------------------------------------------------------------- */

const categoryOf = (node: GraphNode): Category | null =>
  resolveItem(node.data.catalogId, { name: node.data.customName ?? "", category: node.data.customCategory ?? null })?.category ?? null;

/** Components of these categories that actually carry traffic. */
function serving(ctx: CheckContext, categories: Category[]): GraphNode[] {
  return ctx.nodes.filter((n) => {
    const category = categoryOf(n);
    const sim = ctx.baseline.nodes[n.id];
    return category && categories.includes(category) && sim && sim.load.reads + sim.load.writes > 0;
  });
}

const supportsTarget = (): Objective => ({
  id: "supports",
  label: "Serve every user at peak",
  check: ({ baseline }) => baseline.supportedUsers >= baseline.users,
});

const uses = (id: string, label: string, categories: Category[]): Objective => ({
  id,
  label,
  check: (ctx) => serving(ctx, categories).length > 0,
});

const survives = (failureId: string, label: string): Objective => ({
  id: `survives-${failureId}`,
  label,
  check: ({ report }) => report.failures.find((f) => f.id === failureId)?.verdict === "survives",
});

const underBudget = (dollars: number): Objective => ({
  id: "budget",
  budget: dollars,
  label: `Stay under $${dollars.toLocaleString("en-US")}/month (estimated)`,
  check: ({ baseline }) => baseline.monthlyCost <= dollars,
});

const maxUtilization = (id: string, label: string, categories: Category[], max: number, writesOnly = false): Objective => ({
  id,
  label,
  check: (ctx) => {
    const nodes = serving(ctx, categories);
    return (
      nodes.length > 0 &&
      nodes.every((n) => {
        const sim = ctx.baseline.nodes[n.id];
        if (!writesOnly) return sim.utilization <= max;
        const item = resolveItem(n.data.catalogId)!;
        const writeCap = (item.unitWriteRps ?? item.unitRps) * (item.writesScale === false ? 1 : n.data.units);
        return sim.load.writes / writeCap <= max;
      })
    );
  },
});

const noFinding = (id: string, label: string, text: string): Objective => ({
  id,
  label,
  check: ({ baseline }) => !baseline.findings.some((f) => f.message.includes(text)),
});

const azureOnly: Objective = {
  id: "azure-only",
  label: "Build it with Azure services",
  check: ({ nodes }) => nodes.every((n) => resolveItem(n.data.catalogId)?.provider !== "aws"),
};

/** There's a direct connection from one kind of component to another. */
const connects = (id: string, label: string, from: Category[], to: Category[]): Objective => ({
  id,
  label,
  check: ({ nodes, edges }) => {
    const category = new Map(nodes.map((n) => [n.id, categoryOf(n)]));
    return edges.some((e) => from.includes(category.get(e.source)!) && to.includes(category.get(e.target)!));
  },
});

const usesService = (id: string, label: string, catalogIds: string[]): Objective => ({
  id,
  label,
  check: (ctx) => ctx.nodes.some((n) => catalogIds.includes(n.data.catalogId) && (ctx.baseline.nodes[n.id]?.load.reads ?? 0) + (ctx.baseline.nodes[n.id]?.load.writes ?? 0) > 0),
});

const ARCH = "https://learn.microsoft.com/en-us/azure/architecture";

const hasMonitoring: Objective = {
  id: "observability",
  label: "Add monitoring so you'd know it's failing",
  check: ({ nodes }) => nodes.some((n) => categoryOf(n) === "monitoring"),
};

/* -------------------------------------------------------------------------- */
/*                                   Levels                                   */
/* -------------------------------------------------------------------------- */

function scenario(base: Partial<Scenario> & Pick<Scenario, "id" | "title" | "prompt" | "dailyActiveUsers">): Scenario {
  return {
    requestsPerUserPerDay: 50,
    peakFactor: 3,
    readRatio: 0.9,
    cacheableAtEdge: 0.5,
    targetAvailability: 0.999,
    requirements: [],
    rubric: [],
    ...base,
  };
}

export const LEVELS: Level[] = [
  {
    id: "first-deploy",
    chapter: 1,
    title: "First deploy",
    brief: "Your startup just launched and 20,000 people use the app every day. Get the traffic from Users to something that can answer it.",
    scenario: scenario({ id: "lvl-first-deploy", title: "First deploy", prompt: "Serve 20,000 daily users.", dailyActiveUsers: 20_000 }),
    required: [supportsTarget(), uses("compute", "Route traffic to a compute tier", ["compute", "serverless"])],
    bonus: [underBudget(150), noFinding("no-spof", "Avoid single points of failure", "single point of failure")],
    hints: [
      "Drag Users and EC2 Auto Scaling onto the canvas, then connect Users → EC2.",
      "One instance is a single point of failure: use two, or spread it across availability zones.",
    ],
  },
  {
    id: "share-the-load",
    chapter: 1,
    title: "Share the load",
    brief: "300,000 daily users. One server won't cut it anymore, and something has to decide which server gets each request.",
    scenario: scenario({ id: "lvl-share-the-load", title: "Share the load", prompt: "Serve 300,000 daily users.", dailyActiveUsers: 300_000, requestsPerUserPerDay: 60 }),
    required: [
      supportsTarget(),
      uses("lb", "Put a load balancer in front of the servers", ["loadBalancer"]),
      noFinding("balanced", "Don't send traffic straight to a group of servers", "Nothing balances traffic"),
    ],
    bonus: [
      survives("single-failure", "Survive losing any one instance"),
      survives("az-outage", "Survive an availability zone outage"),
    ],
    hints: [
      "Users → Application Load Balancer → EC2. Check how many requests reach EC2 and how many each instance handles.",
      "Losing one instance must still leave enough capacity: plan for N+1.",
      "Tick 'Spread across availability zones' and keep enough instances that the other two zones can carry the peak when one goes down.",
    ],
  },
  {
    id: "remember-things",
    chapter: 1,
    title: "Remember things",
    brief: "Users now have accounts and data that must survive a restart. Add a database without exposing it to the internet.",
    scenario: scenario({ id: "lvl-remember-things", title: "Remember things", prompt: "Serve 300,000 daily users with persistent data.", dailyActiveUsers: 300_000, requestsPerUserPerDay: 60 }),
    required: [
      supportsTarget(),
      uses("database", "Store data in a database", ["sqlDb", "nosqlDb"]),
      noFinding("no-direct-db", "Keep clients away from the database", "talk to"),
    ],
    bonus: [survives("single-failure", "Survive any single failure"), underBudget(800)],
    hints: [
      "Users → load balancer → app servers → database. The app tier is the only thing that talks to the database.",
      "A single-AZ database is a single point of failure. Multi-AZ keeps a standby in another zone.",
    ],
  },
  {
    id: "read-heavy",
    chapter: 2,
    title: "Read-heavy",
    brief: "1 million daily users, 9 reads for every write. The database is getting hammered by the same popular data over and over.",
    scenario: SCENARIOS_BY_ID["web-1m"],
    required: [supportsTarget(), maxUtilization("db-headroom", "Keep every database under 30% utilization", ["sqlDb", "nosqlDb"], 0.3)],
    bonus: [uses("cache", "Serve hot reads from a cache", ["cache"]), underBudget(2_000)],
    hints: [
      "Read replicas add read capacity, but a cache in front of the database removes most reads entirely.",
      "Connect the app tier to both the cache and the database: the model treats it as cache-aside.",
    ],
  },
  {
    id: "the-edge",
    chapter: 2,
    title: "The edge",
    brief: "2 million viewers stream video. Almost every request is a video segment that never changes. Serving it all from your servers would take an absurd fleet.",
    scenario: SCENARIOS_BY_ID["video"],
    required: [supportsTarget(), uses("cdn", "Serve cacheable content from a CDN", ["cdn"])],
    bonus: [uses("storage", "Keep the video files in object storage", ["objectStorage"]), underBudget(2_500)],
    hints: [
      "Put a CDN between Users and your app: it absorbs the cacheable share of requests.",
      "Video files belong in object storage (S3 / Blob Storage) behind the app or the CDN.",
    ],
  },
  {
    id: "production-ready",
    chapter: 2,
    title: "One million, production-ready",
    brief: "Same 1M users, but now the business needs it to stay up when things break. Every tier needs redundancy.",
    scenario: SCENARIOS_BY_ID["web-1m"],
    required: [
      supportsTarget(),
      noFinding("no-spof", "No single points of failure", "single point of failure"),
      survives("az-outage", "Survive an availability zone outage"),
    ],
    bonus: [survives("single-failure", "Survive any single failure"), hasMonitoring],
    hints: [
      "Every self-managed component (servers, cache, database) needs multi-AZ.",
      "When a zone dies, multi-AZ components lose the units in that zone (up to a third): the rest must carry the peak.",
    ],
  },
  {
    id: "flash-sale",
    chapter: 3,
    title: "Flash sale",
    brief: "3 million shoppers arrive within minutes: traffic spikes 12× and orders must never be lost. Don't let the checkout write straight into the database at peak.",
    scenario: SCENARIOS_BY_ID["flash-sale"],
    required: [supportsTarget(), uses("queue", "Buffer orders in a queue", ["queue"])],
    bonus: [
      maxUtilization("write-headroom", "Keep database writes under 50% of capacity", ["sqlDb", "nosqlDb"], 0.5, true),
      survives("az-outage", "Survive an availability zone outage"),
    ],
    hints: [
      "Connect the app tier to a queue and the database: writes go through the queue, workers drain it at the average rate.",
      "Queue → workers (compute) → database. The queue smooths the 12× peak down to the average.",
    ],
  },
  {
    id: "real-time-chat",
    chapter: 3,
    title: "Real-time chat",
    brief: "5 million daily users sending messages. Clients need messages pushed instantly, and history must scale with writes.",
    scenario: SCENARIOS_BY_ID["chat"],
    required: [
      supportsTarget(),
      uses("realtime", "Push messages over persistent connections", ["realtime"]),
      uses("nosql", "Store history in a store that scales writes", ["nosqlDb"]),
    ],
    bonus: [survives("az-outage", "Survive an availability zone outage"), underBudget(6_000)],
    hints: [
      "API Gateway WebSocket or Web PubSub keeps connections open; count its units against the peak.",
      "SQL writes are capped by one primary. A NoSQL store scales writes with partitions.",
    ],
  },
  {
    id: "url-shortener",
    chapter: 3,
    title: "URL shortener",
    brief: "100 million redirects a day, 99% reads. Redirects must be fast and cheap.",
    scenario: SCENARIOS_BY_ID["url-shortener"],
    required: [supportsTarget(), uses("cache", "Cache popular short codes", ["cache"]), uses("kv", "Store mappings in a key-value store", ["nosqlDb"])],
    bonus: [survives("az-outage", "Survive an availability zone outage"), underBudget(2_500)],
    hints: [
      "Mappings are simple key → value lookups: a NoSQL store fits.",
      "A few popular links get most traffic, so a cache with a high hit rate removes most database reads.",
    ],
  },

  // ------------------------------------------------ Azure Architecture Center
  {
    id: "az-basic-web-app",
    chapter: 4,
    title: "Basic web application",
    brief: "A proof of concept: a web app on App Service backed by Azure SQL Database, for 50,000 daily users. Keep it simple and cheap, but make sure you can see what it's doing.",
    scenario: scenario({ id: "lvl-az-basic", title: "Basic web application", prompt: "Serve 50,000 daily users with App Service and SQL Database.", dailyActiveUsers: 50_000 }),
    required: [
      supportsTarget(),
      azureOnly,
      usesService("app-service", "Host the app on App Service", ["az-appservice"]),
      usesService("sql", "Store data in Azure SQL Database", ["az-sql"]),
    ],
    bonus: [hasMonitoring, underBudget(600)],
    hints: [
      "Users → App Service → Azure SQL Database. That's the whole request path in the reference architecture.",
      "The reference adds Azure Monitor / Application Insights to see requests and database calls.",
    ],
    reference: { title: "Basic web application", url: `${ARCH}/web-apps/app-service/architectures/basic-web-app` },
    provider: "azure",
  },
  {
    id: "az-zone-redundant",
    chapter: 4,
    title: "Zone-redundant web app",
    brief: "Take the basic web app to production for 500,000 daily users: one secure entry point, and no single zone failure may take it down.",
    scenario: scenario({ id: "lvl-az-baseline", title: "Zone-redundant web app", prompt: "Serve 500,000 daily users and survive a zone outage.", dailyActiveUsers: 500_000, requestsPerUserPerDay: 60 }),
    required: [
      supportsTarget(),
      azureOnly,
      connects("gateway-first", "Put Application Gateway in front of the app", ["loadBalancer"], ["compute"]),
      survives("az-outage", "Survive an availability zone outage"),
    ],
    bonus: [noFinding("no-spof", "No single points of failure", "single point of failure"), uses("cdn", "Serve static assets from a CDN", ["cdn"])],
    hints: [
      "Users → Application Gateway → App Service → SQL Database, with zone redundancy on App Service and SQL.",
      "The reference puts at least one App Service instance in each of the region's zones and overprovisions, so the instances left after a zone failure still carry the peak.",
      "It also recommends a CDN for static assets like images and scripts.",
    ],
    reference: { title: "Baseline highly available zone-redundant web application", url: `${ARCH}/web-apps/app-service/architectures/baseline-zone-redundant` },
    provider: "azure",
  },
  {
    id: "az-static-content",
    chapter: 4,
    title: "Static content hosting",
    brief: "A media-heavy site where 90% of requests are images, scripts and documents. Stop paying app servers to hand out files.",
    scenario: scenario({
      id: "lvl-az-static",
      title: "Static content hosting",
      prompt: "Serve 1,000,000 daily users of a static-heavy site.",
      dailyActiveUsers: 1_000_000,
      requestsPerUserPerDay: 80,
      readRatio: 0.97,
      cacheableAtEdge: 0.9,
    }),
    required: [
      supportsTarget(),
      azureOnly,
      uses("blob", "Serve static files from Blob Storage", ["objectStorage"]),
      uses("edge", "Cache them at the edge with Front Door", ["cdn"]),
    ],
    bonus: [maxUtilization("small-app-tier", "Keep the app tier under 60% utilization", ["compute"], 0.6), underBudget(1_500)],
    hints: [
      "Static files go in Blob Storage; a CDN (Front Door) caches them close to users.",
      "With the edge absorbing most requests, the app tier only handles the dynamic part.",
    ],
    reference: { title: "Static Content Hosting pattern", url: `${ARCH}/patterns/static-content-hosting` },
    provider: "azure",
  },
  {
    id: "az-protect-apis",
    chapter: 4,
    title: "Protect your APIs",
    brief: "Your public API gets 200 million calls a day. Put a web application firewall in front, and a gateway that handles auth, rate limits and routing before anything reaches your services.",
    scenario: scenario({
      id: "lvl-az-apis",
      title: "Protect your APIs",
      prompt: "Serve a public API with 200 million calls per day.",
      dailyActiveUsers: 2_000_000,
      requestsPerUserPerDay: 100,
      readRatio: 0.8,
      cacheableAtEdge: 0,
    }),
    required: [
      supportsTarget(),
      azureOnly,
      connects("waf-before-apim", "Route traffic Application Gateway → API Management", ["loadBalancer"], ["apiGateway"]),
      connects("apim-to-backend", "API Management fronts your backend services", ["apiGateway"], ["compute", "serverless"]),
    ],
    bonus: [survives("az-outage", "Survive an availability zone outage"), underBudget(5_000)],
    hints: [
      "Users → Application Gateway (WAF) → API Management → your backend (AKS or App Service).",
      "API Management publishes an estimated throughput per unit: count how many units the peak needs.",
    ],
    reference: { title: "Protect APIs with Application Gateway and API Management", url: `${ARCH}/web-apps/api-management/architectures/protect-apis` },
    provider: "azure",
  },
  {
    id: "az-load-leveling",
    chapter: 4,
    title: "Queue-based load leveling",
    brief: "Several App Service instances write to one data store, and traffic arrives in bursts 8× the average. The database times out at every peak. Level the load.",
    scenario: scenario({
      id: "lvl-az-leveling",
      title: "Queue-based load leveling",
      prompt: "Absorb 8× write bursts without overloading the database.",
      dailyActiveUsers: 1_000_000,
      requestsPerUserPerDay: 60,
      peakFactor: 8,
      readRatio: 0.5,
      cacheableAtEdge: 0,
    }),
    required: [
      supportsTarget(),
      azureOnly,
      uses("service-bus", "Buffer writes in a queue", ["queue"]),
      maxUtilization("db-writes", "Keep database writes under 50% of capacity at peak", ["sqlDb", "nosqlDb"], 0.5, true),
    ],
    bonus: [connects("functions-consumer", "Drain the queue with Azure Functions", ["queue"], ["serverless"]), survives("az-outage", "Survive an availability zone outage")],
    hints: [
      "App Service → Service Bus → a consumer → the database. The consumer drains the queue at the average rate, not the peak.",
      "The reference uses an Azure Functions app that reads from the Service Bus queue.",
    ],
    reference: { title: "Queue-Based Load Leveling pattern", url: `${ARCH}/patterns/queue-based-load-leveling` },
    provider: "azure",
  },
  {
    id: "az-polyglot",
    chapter: 4,
    title: "Polyglot persistence",
    brief: "An e-commerce platform: product catalog, carts and sessions change shape constantly and get hammered; orders and payments need ACID transactions. One database won't fit both.",
    scenario: scenario({
      id: "lvl-az-polyglot",
      title: "Polyglot persistence",
      prompt: "Serve 2,000,000 daily shoppers with the right database for each workload.",
      dailyActiveUsers: 2_000_000,
      requestsPerUserPerDay: 60,
      peakFactor: 4,
      readRatio: 0.9,
      cacheableAtEdge: 0.3,
    }),
    required: [
      supportsTarget(),
      azureOnly,
      uses("gateway", "Enter through API Management", ["apiGateway"]),
      usesService("cosmos", "Catalog, carts and sessions in Cosmos DB", ["az-cosmos"]),
      usesService("sql", "Orders and payments in Azure SQL Database", ["az-sql"]),
    ],
    bonus: [survives("az-outage", "Survive an availability zone outage"), underBudget(6_000)],
    hints: [
      "Clients → API Management → microservices (AKS or App Service). Services connect to Cosmos DB and to SQL Database.",
      "Cosmos DB scales throughput per partition; SQL Database keeps multi-table transactions consistent.",
    ],
    reference: { title: "Polyglot persistence with Azure Cosmos DB and Azure SQL Database", url: `${ARCH}/databases/idea/combine-relational-nosql` },
    provider: "azure",
  },
];

export const LEVELS_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

export type ObjectiveResult = { id: string; label: string; passed: boolean; bonus: boolean };

export type LevelResult = { stars: number; objectives: ObjectiveResult[] };

export function evaluateLevel(level: Level, ctx: CheckContext): LevelResult {
  const required = level.required.map((o) => ({ id: o.id, label: o.label, passed: o.check(ctx), bonus: false }));
  const bonus = level.bonus.map((o) => ({ id: `bonus-${o.id}`, label: o.label, passed: o.check(ctx), bonus: true }));
  const cleared = required.every((o) => o.passed);
  return { stars: cleared ? 1 + bonus.filter((o) => o.passed).length : 0, objectives: [...required, ...bonus] };
}

export function nextLevel(id: string): Level | null {
  const index = LEVELS.findIndex((l) => l.id === id);
  return LEVELS[index + 1] ?? null;
}
