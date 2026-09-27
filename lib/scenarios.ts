import type { Category } from "./catalog";

export type RubricItem = {
  id: string;
  // Phrased as a yes/no condition about the design; sent to Jev as a Noul.
  check: string;
  // Categories the offline mock looks for when there is no API key.
  expects: Category[];
};

export type Scenario = {
  id: string;
  title: string;
  prompt: string;
  dailyActiveUsers: number;
  requestsPerUserPerDay: number;
  // Peak-to-average traffic ratio.
  peakFactor: number;
  readRatio: number;
  // Share of traffic a CDN can absorb (static assets, media segments).
  cacheableAtEdge: number;
  targetAvailability: number;
  requirements: string[];
  rubric: RubricItem[];
};

export const SCENARIOS: Scenario[] = [
  {
    id: "web-1m",
    title: "Web app for 1M users",
    prompt: "How would you build the infrastructure for a web application with 1 million daily active users?",
    dailyActiveUsers: 1_000_000,
    requestsPerUserPerDay: 60,
    peakFactor: 3,
    readRatio: 0.9,
    cacheableAtEdge: 0.5,
    targetAvailability: 0.999,
    requirements: [
      "Single region is fine, users mostly in one continent",
      "p95 latency under 300 ms",
      "99.9% availability",
      "Read-heavy: roughly 9 reads per write",
    ],
    rubric: [
      { id: "stateless_lb", check: "The application tier is stateless and horizontally scaled behind a load balancer.", expects: ["loadBalancer", "compute"] },
      { id: "read_cache", check: "Hot reads are served from an in-memory cache instead of hitting the database every time.", expects: ["cache"] },
      { id: "db_scaling", check: "The database layer can handle the read volume, for example with read replicas.", expects: ["sqlDb"] },
      { id: "edge", check: "Static assets are served from a CDN.", expects: ["cdn"] },
      { id: "observability", check: "The design includes monitoring, metrics or alerting.", expects: ["monitoring"] },
    ],
  },
  {
    id: "url-shortener",
    title: "URL shortener",
    prompt: "Design a URL shortener that handles 100 million redirects per day.",
    dailyActiveUsers: 10_000_000,
    requestsPerUserPerDay: 10,
    peakFactor: 5,
    readRatio: 0.99,
    cacheableAtEdge: 0.3,
    targetAvailability: 0.9995,
    requirements: [
      "Redirects must be fast (p99 under 50 ms)",
      "Short codes must be unique",
      "Extremely read-heavy: about 100 redirects per new link",
      "Links never expire by default",
    ],
    rubric: [
      { id: "kv_store", check: "Mappings are stored in a key-value or NoSQL store that scales horizontally.", expects: ["nosqlDb"] },
      { id: "redirect_cache", check: "Popular short codes are cached so redirects rarely reach the database.", expects: ["cache"] },
      { id: "edge_redirects", check: "Redirects can be served or cached at the edge close to users.", expects: ["cdn"] },
      { id: "stateless_tier", check: "The redirect service is stateless and horizontally scalable.", expects: ["loadBalancer", "compute"] },
    ],
  },
  {
    id: "chat",
    title: "Real-time chat",
    prompt: "Design a real-time chat service like WhatsApp for 5 million daily active users.",
    dailyActiveUsers: 5_000_000,
    requestsPerUserPerDay: 150,
    peakFactor: 4,
    readRatio: 0.6,
    cacheableAtEdge: 0.05,
    targetAvailability: 0.9995,
    requirements: [
      "Messages delivered in under 500 ms to online users",
      "Message history is kept and paginated",
      "Presence (online/offline) is shown",
      "Write-heavy compared to typical web apps",
    ],
    rubric: [
      { id: "push", check: "Clients keep persistent connections (WebSockets or similar) for pushing messages.", expects: ["realtime"] },
      { id: "fanout", check: "Message fan-out is decoupled with a queue or stream.", expects: ["queue"] },
      { id: "history_store", check: "Message history lives in a store that scales writes horizontally, partitioned by conversation.", expects: ["nosqlDb"] },
      { id: "presence", check: "Presence and session state are kept in a fast in-memory store.", expects: ["cache"] },
    ],
  },
  {
    id: "video",
    title: "Video streaming",
    prompt: "Design a video streaming platform like YouTube for 2 million daily viewers.",
    dailyActiveUsers: 2_000_000,
    requestsPerUserPerDay: 400,
    peakFactor: 3,
    readRatio: 0.99,
    cacheableAtEdge: 0.95,
    targetAvailability: 0.999,
    requirements: [
      "Most traffic is video segment downloads",
      "Uploads must be transcoded into several resolutions",
      "Video metadata and search",
    ],
    rubric: [
      { id: "blob_cdn", check: "Video files live in object storage and are delivered through a CDN.", expects: ["objectStorage", "cdn"] },
      { id: "async_transcode", check: "Transcoding happens asynchronously through a queue and workers.", expects: ["queue"] },
      { id: "metadata_db", check: "There is a separate database for video metadata.", expects: ["sqlDb"] },
      { id: "search", check: "There is a search index for finding videos.", expects: ["search"] },
    ],
  },
  {
    id: "flash-sale",
    title: "E-commerce flash sale",
    prompt: "Design the checkout for an e-commerce flash sale with 3 million shoppers arriving within minutes.",
    dailyActiveUsers: 3_000_000,
    requestsPerUserPerDay: 40,
    peakFactor: 12,
    readRatio: 0.85,
    cacheableAtEdge: 0.4,
    targetAvailability: 0.9995,
    requirements: [
      "Traffic spikes about 12x in minutes",
      "Never oversell inventory",
      "Orders must not be lost even if downstream is slow",
    ],
    rubric: [
      { id: "order_queue", check: "Orders are buffered in a queue so spikes do not overwhelm the database.", expects: ["queue"] },
      { id: "inventory_cache", check: "Inventory counts use a fast atomic store such as Redis.", expects: ["cache"] },
      { id: "throttle", check: "An API gateway or similar throttles and protects the backend from the spike.", expects: ["apiGateway"] },
      { id: "edge_static", check: "Product pages and assets are cached at the edge.", expects: ["cdn"] },
    ],
  },
];

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

export function peakRps(scenario: Scenario, users = scenario.dailyActiveUsers): number {
  return ((users * scenario.requestsPerUserPerDay) / 86_400) * scenario.peakFactor;
}
