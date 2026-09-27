import "server-only";

import { APIConnectionError, TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { CATEGORY_LABELS, type Category } from "../catalog";
import type { Scenario } from "../scenarios";
import type { EvaluationInput, EvaluationResult, ScoreAnswer } from "../evaluation";

let client: TypeSafeClient | null = null;

function getClient(): TypeSafeClient | null {
  if (!process.env.TYPESAFE_API_KEY) return null;
  // Jev usually answers in well under a second, so a stalled request is better
  // reported quickly than retried for half a minute.
  client ??= new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY, timeout: 8_000, retry: { maxRetries: 1 } });
  return client;
}

/** A user-facing message for a failed Jev call. */
export function describeJevError(error: unknown): { message: string; status: number } {
  if (error instanceof APIConnectionError) {
    return { message: "Jev didn't respond in time. Try again in a moment.", status: 504 };
  }
  return { message: "Jev request failed. Check the server logs.", status: 502 };
}

/* -------------------------------------------------------------------------- */
/*                         Custom component classifier                        */
/* -------------------------------------------------------------------------- */

const CATEGORY_CRITERIA: Record<Exclude<Category, "client">, string> = {
  dns: "Resolves domain names to addresses, e.g. Cloudflare DNS, NS1.",
  cdn: "Edge network that caches and serves content near users, e.g. Cloudflare, Akamai, Fastly.",
  loadBalancer: "Distributes traffic across servers, e.g. NGINX, HAProxy, Envoy, F5.",
  apiGateway: "Front door for APIs with auth, routing and rate limiting, e.g. Kong, Apigee.",
  compute: "Runs long-lived application servers or containers, e.g. Kubernetes, Heroku, Cloud Run, a Node.js service.",
  serverless: "Runs short functions per request or event, e.g. Cloudflare Workers, Vercel Functions.",
  realtime: "Keeps persistent client connections to push updates, e.g. Socket.IO, Pusher, Ably.",
  cache: "In-memory store for hot data or sessions, e.g. Memcached, Redis, Valkey, Dragonfly.",
  sqlDb: "Relational database with SQL and transactions, e.g. MySQL, CockroachDB, Spanner, PlanetScale.",
  nosqlDb: "Non-relational store scaled by partitions, e.g. MongoDB, Cassandra, ScyllaDB, Bigtable.",
  queue: "Message broker or event stream between producers and consumers, e.g. Kafka, RabbitMQ, NATS, Pub/Sub.",
  objectStorage: "Stores files and blobs, e.g. Google Cloud Storage, MinIO, R2.",
  search: "Full-text or vector search index, e.g. Elasticsearch, Algolia, Meilisearch, Pinecone.",
  monitoring: "Metrics, logs, traces and alerting, e.g. Datadog, Prometheus, Grafana, Sentry.",
};

export async function classifyComponent(name: string): Promise<{ category: Category; confidence: number; mock: boolean }> {
  const typesafe = getClient();
  if (!typesafe) return mockClassify(name);

  const response = await typesafe.systemOne({
    state: { component: name },
    questions: {
      role: {
        type: "choice",
        instructions:
          "In a cloud system design diagram, which architectural role does the `component` most likely play? Judge by what the technology is typically used for.",
        criteria: CATEGORY_CRITERIA,
      },
    },
  });
  const answer = response.answers.role;
  return { category: answer.choice as Category, confidence: answer.confidence, mock: false };
}

const MOCK_KEYWORDS: [RegExp, Category][] = [
  [/kafka|rabbit|nats|pub\/?sub|pulsar|queue|bus|stream/i, "queue"],
  [/redis|memcache|valkey|dragonfly|cache/i, "cache"],
  [/mongo|cassandra|scylla|bigtable|dynamo|couch|nosql|firestore/i, "nosqlDb"],
  [/postgres|mysql|maria|sql|cockroach|spanner|planetscale|oracle/i, "sqlDb"],
  [/elastic|algolia|meili|solr|search|pinecone|vector/i, "search"],
  [/nginx|haproxy|envoy|balancer|traefik/i, "loadBalancer"],
  [/kong|apigee|gateway/i, "apiGateway"],
  [/cloudflare|akamai|fastly|cdn|edge/i, "cdn"],
  [/datadog|prometheus|grafana|sentry|newrelic|monitor|log/i, "monitoring"],
  [/socket|pusher|ably|websocket|signalr/i, "realtime"],
  [/worker|function|lambda/i, "serverless"],
  [/minio|r2|storage|bucket|gcs/i, "objectStorage"],
  [/dns/i, "dns"],
];

function mockClassify(name: string) {
  const match = MOCK_KEYWORDS.find(([pattern]) => pattern.test(name));
  return { category: match?.[1] ?? "compute", confidence: match ? 0.6 : 0.1, mock: true };
}

/* -------------------------------------------------------------------------- */
/*                              Design evaluation                             */
/* -------------------------------------------------------------------------- */

const SCORE_QUESTIONS = {
  scalability: {
    type: "score",
    instructions:
      "How well does the `design` scale to the traffic in `scenario`? Use `capacity_model` as measured facts about throughput; judge whether the architecture itself could keep growing.",
    criteria: [
      "Cannot handle the target load and has no clear way to grow",
      "Handles some load but has a hard bottleneck that blocks the target",
      "Meets the target load, but growing further needs redesign",
      "Meets the target and every tier can scale out independently",
    ],
  },
  reliability: {
    type: "score",
    instructions:
      "How resilient is the `design` to a single server, zone or dependency failing, given the availability goal in `scenario`?",
    criteria: [
      "Several single points of failure; one crash takes the system down",
      "Some redundancy, but a critical component is still a single point of failure",
      "Redundant in most tiers; failures degrade service rather than stop it",
      "Redundant across zones in every tier, with no single point of failure",
    ],
  },
  data_design: {
    type: "score",
    instructions:
      "How well do the data stores, caches and queues in the `design` fit the access pattern described in `scenario` (read/write mix, consistency, data shape)?",
    criteria: [
      "Data layer is missing or clearly wrong for the workload",
      "Workable, but ignores the dominant access pattern",
      "Good fit for the main access pattern with minor gaps",
      "Each store is chosen deliberately for its access pattern",
    ],
  },
} as const;

const EXPLANATION_QUESTION = {
  type: "score",
  instructions:
    "How well does `candidate_explanation` justify the `design` the way a strong system design interview answer would: stating assumptions, estimating load, and explaining trade-offs?",
  criteria: [
    "No real reasoning; lists components without saying why",
    "Some reasons, but no estimates or trade-offs",
    "Clear reasoning with estimates or trade-offs, but not both",
    "States assumptions, estimates load and discusses trade-offs and alternatives",
  ],
} as const;

export const FOCUS_OPTIONS = {
  capacity: "Throughput: some tier is over capacity or cannot scale out",
  caching: "Caching: reads hit the database or origin more than necessary",
  redundancy: "Redundancy: single points of failure or single-zone components",
  async: "Asynchronous processing: slow or spiky work should go through queues",
  data_model: "Data storage: the database choice or partitioning does not fit the workload",
  edge: "Edge delivery: content should be served closer to users via CDN or DNS routing",
  observability: "Observability: no way to monitor, alert or debug in production",
  none: "Nothing important is missing for this scenario",
} as const;

function describeState(input: EvaluationInput, scenario: Scenario) {
  return {
    scenario: {
      question: scenario.prompt,
      daily_active_users: input.users,
      requirements: scenario.requirements,
      read_percentage: Math.round(scenario.readRatio * 100),
      peak_to_average_ratio: scenario.peakFactor,
    },
    design: {
      components: input.components.map((c) => ({
        name: c.name,
        role: CATEGORY_LABELS[c.category],
        units: c.units,
        multi_az: c.multiAz,
      })),
      connections: input.connections,
    },
    capacity_model: {
      peak_requests_per_second: Math.round(input.simulation.peakRps),
      max_supported_users: Number.isFinite(input.simulation.supportedUsers)
        ? Math.round(input.simulation.supportedUsers)
        : "unbounded",
      bottleneck: input.simulation.bottleneck,
      estimated_availability_percent: +(input.simulation.availability * 100).toFixed(3),
      detected_issues: input.simulation.findings,
    },
    candidate_explanation: input.explanation || null,
  };
}

export async function evaluateDesign(input: EvaluationInput, scenario: Scenario): Promise<EvaluationResult> {
  const typesafe = getClient();
  if (!typesafe) return mockEvaluate(input, scenario);

  const hasExplanation = input.explanation.trim().length > 20;
  const questions: Questions = {
    ...SCORE_QUESTIONS,
    ...(hasExplanation ? { explanation: EXPLANATION_QUESTION } : {}),
    next_focus: {
      type: "choice",
      instructions:
        "An interviewer reviews the `design` for `scenario`. Which single area should the candidate improve first to make the biggest difference?",
      criteria: FOCUS_OPTIONS,
    },
  };
  for (const item of scenario.rubric) {
    questions[`rubric_${item.id}`] = {
      type: "noul",
      instructions: `Does the \`design\` satisfy this interviewer checklist item: "${item.check}"`,
    };
  }

  const response = await typesafe.systemOne({ state: describeState(input, scenario), questions });
  const answers = response.answers;

  const score = (id: string): ScoreAnswer | null => {
    const answer = answers[id];
    if (answer?.type !== "score") return null;
    return {
      score: answer.score,
      max: Object.keys(answer.probabilities).length - 1,
      confidence: answer.confidence,
      probabilities: Object.values(answer.probabilities).map(Number),
    };
  };

  const focus = answers.next_focus;
  return {
    model: response.model,
    mock: false,
    scores: {
      scalability: score("scalability"),
      reliability: score("reliability"),
      data_design: score("data_design"),
      explanation: score("explanation"),
    },
    nextFocus:
      focus?.type === "choice"
        ? { choice: focus.choice as keyof typeof FOCUS_OPTIONS, confidence: focus.confidence, probabilities: focus.probabilities }
        : null,
    rubric: scenario.rubric.map((item) => {
      const answer = answers[`rubric_${item.id}`];
      return { id: item.id, check: item.check, probability: answer?.type === "noul" ? answer.noul : 0 };
    }),
  };
}

/** Keyless fallback from graph facts alone. Clearly labeled as mock in the UI. */
function mockEvaluate(input: EvaluationInput, scenario: Scenario): EvaluationResult {
  const categories = new Set(input.components.map((c) => c.category));
  const ratio = input.simulation.supportedUsers / input.users;
  const toScore = (value: number): ScoreAnswer => {
    const clamped = Math.max(0, Math.min(3, value));
    const probabilities = [0, 1, 2, 3].map((level) => Math.exp(-((level - clamped) ** 2) * 2));
    const sum = probabilities.reduce((a, b) => a + b, 0);
    return { score: clamped, max: 3, confidence: 0.3, probabilities: probabilities.map((p) => p / sum) };
  };

  const spofs = input.simulation.findings.filter((f) => f.includes("single point of failure")).length;
  const rubric = scenario.rubric.map((item) => ({
    id: item.id,
    check: item.check,
    probability: item.expects.every((c) => categories.has(c)) ? 0.85 : 0.15,
  }));
  const dataHits = rubric.filter((r) => r.probability > 0.5).length / Math.max(1, rubric.length);

  const focus: keyof typeof FOCUS_OPTIONS =
    ratio < 1 ? "capacity" : spofs > 0 ? "redundancy" : !categories.has("cache") ? "caching" : !categories.has("monitoring") ? "observability" : "none";

  return {
    model: "mock",
    mock: true,
    scores: {
      scalability: toScore(ratio >= 3 ? 3 : ratio >= 1 ? 2 : ratio >= 0.3 ? 1 : 0),
      reliability: toScore(3 - Math.min(3, spofs)),
      data_design: toScore(dataHits * 3),
      explanation: input.explanation.trim().length > 20 ? toScore(Math.min(3, input.explanation.length / 250)) : null,
    },
    nextFocus: { choice: focus, confidence: 0.3, probabilities: { [focus]: 1 } },
    rubric,
  };
}
