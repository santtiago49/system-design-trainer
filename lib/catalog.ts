export type Provider = "aws" | "azure" | "generic";

export type Category =
  | "client"
  | "dns"
  | "cdn"
  | "loadBalancer"
  | "apiGateway"
  | "compute"
  | "serverless"
  | "realtime"
  | "cache"
  | "sqlDb"
  | "nosqlDb"
  | "queue"
  | "objectStorage"
  | "search"
  | "monitoring";

export type CatalogItem = {
  id: string;
  provider: Provider;
  name: string;
  category: Category;
  blurb: string;
  // Requests per second one unit can serve. For databases this is read capacity.
  unitRps: number;
  // Write capacity per unit (databases only). Falls back to unitRps.
  unitWriteRps?: number;
  // Whether write capacity grows with units (sharding/partitions) or stays on one primary.
  writesScale?: boolean;
  // What one "unit" means for this service.
  unitLabel: string;
  defaultUnits: number;
  // Managed services handle redundancy themselves; availability is their SLA.
  managed: boolean;
  sla?: number;
  // Rough monthly USD per unit, only for relative comparisons.
  monthlyCost: number;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  client: "Clients",
  dns: "DNS",
  cdn: "CDN / Edge",
  loadBalancer: "Load balancer",
  apiGateway: "API gateway",
  compute: "Compute",
  serverless: "Serverless",
  realtime: "Real-time",
  cache: "Cache",
  sqlDb: "SQL database",
  nosqlDb: "NoSQL database",
  queue: "Queue / Stream",
  objectStorage: "Object storage",
  search: "Search",
  monitoring: "Observability",
};

// Numbers are ballpark figures meant for interview-style estimation, not vendor specs.
const DEFAULTS: Record<Category, Omit<CatalogItem, "id" | "provider" | "name" | "category" | "blurb">> = {
  client: { unitRps: Infinity, unitLabel: "", defaultUnits: 1, managed: true, sla: 1, monthlyCost: 0 },
  dns: { unitRps: 10_000_000, unitLabel: "zone", defaultUnits: 1, managed: true, sla: 1, monthlyCost: 1 },
  cdn: { unitRps: 1_000_000, unitLabel: "distribution", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 400 },
  loadBalancer: { unitRps: 100_000, unitLabel: "LB", defaultUnits: 1, managed: true, sla: 0.9999, monthlyCost: 60 },
  apiGateway: { unitRps: 10_000, unitLabel: "unit", defaultUnits: 1, managed: true, sla: 0.9995, monthlyCost: 350 },
  compute: { unitRps: 500, unitLabel: "instances", defaultUnits: 2, managed: false, monthlyCost: 70 },
  serverless: { unitRps: 10_000, unitLabel: "×1k concurrency", defaultUnits: 1, managed: true, sla: 0.9995, monthlyCost: 300 },
  realtime: { unitRps: 2_000, unitLabel: "units", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 250 },
  cache: { unitRps: 100_000, unitLabel: "nodes", defaultUnits: 1, managed: false, monthlyCost: 120 },
  sqlDb: { unitRps: 5_000, unitWriteRps: 2_000, writesScale: false, unitLabel: "replicas", defaultUnits: 1, managed: false, monthlyCost: 350 },
  nosqlDb: { unitRps: 20_000, unitWriteRps: 10_000, writesScale: true, unitLabel: "partitions", defaultUnits: 1, managed: true, sla: 0.9999, monthlyCost: 400 },
  queue: { unitRps: 50_000, unitLabel: "queues", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 40 },
  objectStorage: { unitRps: 50_000, unitLabel: "buckets", defaultUnits: 1, managed: true, sla: 0.9999, monthlyCost: 200 },
  search: { unitRps: 1_000, unitLabel: "nodes", defaultUnits: 2, managed: false, monthlyCost: 250 },
  monitoring: { unitRps: Infinity, unitLabel: "", defaultUnits: 1, managed: true, sla: 1, monthlyCost: 100 },
};

function item(
  id: string,
  provider: Provider,
  name: string,
  category: Category,
  blurb: string,
  overrides: Partial<CatalogItem> = {}
): CatalogItem {
  return { id, provider, name, category, blurb, ...DEFAULTS[category], ...overrides };
}

export const CATALOG: CatalogItem[] = [
  item("users", "generic", "Users", "client", "Traffic source. Load comes from the scenario."),

  item("aws-route53", "aws", "Route 53", "dns", "Managed DNS with health checks and latency routing."),
  item("aws-cloudfront", "aws", "CloudFront", "cdn", "CDN that serves static and cacheable content at the edge."),
  item("aws-alb", "aws", "Application Load Balancer", "loadBalancer", "L7 load balancer across instances and AZs."),
  item("aws-apigw", "aws", "API Gateway", "apiGateway", "Managed API front door with throttling and auth."),
  item("aws-ec2", "aws", "EC2 Auto Scaling", "compute", "Virtual machines running your app tier."),
  item("aws-ecs", "aws", "ECS Fargate", "compute", "Serverless containers for the app tier.", { unitRps: 400, unitLabel: "tasks", monthlyCost: 50 }),
  item("aws-lambda", "aws", "Lambda", "serverless", "Functions that scale per request."),
  item("aws-apigw-ws", "aws", "API Gateway WebSocket", "realtime", "Managed WebSocket connections for push."),
  item("aws-elasticache", "aws", "ElastiCache Redis", "cache", "In-memory cache for hot reads and sessions."),
  item("aws-rds", "aws", "RDS PostgreSQL", "sqlDb", "Relational DB. One primary for writes, replicas for reads."),
  item("aws-aurora", "aws", "Aurora PostgreSQL", "sqlDb", "Cloud-native relational DB with up to 15 replicas.", { unitRps: 8_000, unitWriteRps: 5_000, monthlyCost: 500 }),
  item("aws-dynamodb", "aws", "DynamoDB", "nosqlDb", "Key-value store that scales writes by partition."),
  item("aws-sqs", "aws", "SQS", "queue", "Queue that decouples producers from workers."),
  item("aws-kinesis", "aws", "Kinesis", "queue", "Ordered event stream, scaled by shards.", { unitRps: 1_000, unitLabel: "shards", monthlyCost: 15 }),
  item("aws-s3", "aws", "S3", "objectStorage", "Durable object storage for media and files."),
  item("aws-opensearch", "aws", "OpenSearch", "search", "Full-text search and analytics cluster."),
  item("aws-cloudwatch", "aws", "CloudWatch", "monitoring", "Metrics, logs and alarms."),

  item("az-dns", "azure", "Azure DNS", "dns", "Managed DNS hosting."),
  item("az-frontdoor", "azure", "Front Door", "cdn", "Global edge: CDN, WAF and global load balancing."),
  item("az-appgw", "azure", "Application Gateway", "loadBalancer", "Regional L7 load balancer with WAF."),
  item("az-apim", "azure", "API Management", "apiGateway", "API gateway with policies and throttling.", { unitRps: 4_000 }),
  item("az-vmss", "azure", "VM Scale Sets", "compute", "Autoscaling virtual machines."),
  item("az-aks", "azure", "AKS", "compute", "Managed Kubernetes for the app tier.", { unitRps: 400, unitLabel: "pods", monthlyCost: 50 }),
  item("az-functions", "azure", "Azure Functions", "serverless", "Event-driven serverless functions."),
  item("az-webpubsub", "azure", "Web PubSub", "realtime", "Managed WebSocket fan-out."),
  item("az-redis", "azure", "Azure Cache for Redis", "cache", "Managed Redis cache."),
  item("az-sql", "azure", "Azure SQL Database", "sqlDb", "Managed SQL Server with read replicas."),
  item("az-postgres", "azure", "Azure DB for PostgreSQL", "sqlDb", "Managed PostgreSQL flexible server."),
  item("az-cosmos", "azure", "Cosmos DB", "nosqlDb", "Globally distributed multi-model NoSQL."),
  item("az-servicebus", "azure", "Service Bus", "queue", "Enterprise message broker.", { unitRps: 4_000, unitLabel: "messaging units", monthlyCost: 670 }),
  item("az-eventhubs", "azure", "Event Hubs", "queue", "Event streaming, scaled by throughput units.", { unitRps: 1_000, unitLabel: "TUs", monthlyCost: 22 }),
  item("az-blob", "azure", "Blob Storage", "objectStorage", "Object storage for media and files."),
  item("az-search", "azure", "Azure AI Search", "search", "Managed search index.", { unitLabel: "replicas" }),
  item("az-monitor", "azure", "Azure Monitor", "monitoring", "Metrics, logs and alerts."),
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const CUSTOM_ID = "custom";

/** Profile for a free-text component once it has been classified. */
export function customItem(name: string, category: Category): CatalogItem {
  return item(CUSTOM_ID, "generic", name, category, `Custom component, classified as ${CATEGORY_LABELS[category]}.`);
}

export function resolveItem(catalogId: string, custom?: { name: string; category: Category | null }): CatalogItem | null {
  if (catalogId === CUSTOM_ID) {
    return custom?.category ? customItem(custom.name, custom.category) : null;
  }
  return CATALOG_BY_ID[catalogId] ?? null;
}
