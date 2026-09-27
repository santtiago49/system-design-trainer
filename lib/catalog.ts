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

/**
 * Where a number comes from. Only "quota" and "sla" are commitments or hard
 * limits published by the vendor; "benchmark" is a vendor-published measurement
 * with no guarantee; "assumption" is ours; "none" means the vendor publishes no
 * request-rate limit and the service scales on its own.
 */
export type SourceKind = "quota" | "sla" | "benchmark" | "assumption" | "none";

export type Source = { kind: SourceKind; note: string; url?: string };

export type CatalogItem = {
  id: string;
  provider: Provider;
  name: string;
  category: Category;
  blurb: string;
  // Requests per second one unit can serve (reads, for databases). Infinity = no published limit.
  unitRps: number;
  capacitySource: Source;
  // Write capacity per unit (databases only). Falls back to unitRps.
  unitWriteRps?: number;
  writeSource?: Source;
  // Whether write capacity grows with units (partitions/prefixes) or stays on one primary.
  writesScale?: boolean;
  // What one "unit" means for this service.
  unitLabel: string;
  defaultUnits: number;
  // Managed services handle redundancy themselves, so there is no multi-AZ toggle.
  managed: boolean;
  // Monthly uptime commitment for a single-AZ / default deployment, and for a multi-AZ one.
  sla: number;
  slaMultiAz?: number;
  slaSource: Source;
  // Rough monthly USD per unit, only for relative comparisons. Always an assumption.
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

export const COST_SOURCE: Source = {
  kind: "assumption",
  note: "Rough figure for comparing designs, not taken from vendor pricing pages.",
};

const ASSUMED = (note: string): Source => ({ kind: "assumption", note });

const AWS = {
  apiGateway: "https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html",
  webSocket: "https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html",
  lambda: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
  kinesis: "https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html",
  dynamo: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html",
  s3: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html",
  cloudfront: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html",
  sqs: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html",
  alb: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-limits.html",
  route53: "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DNSLimitations.html",
  sla: (path: string) => `https://aws.amazon.com/${path}/sla/`,
};

const AZURE = {
  sla: "https://www.microsoft.com/licensing/docs/view/Service-Level-Agreements-SLA-for-Online-Services",
  frontDoor:
    "https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#azure-front-door-standard-and-premium-service-limits",
  appGateway: "https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-autoscaling-zone-redundant",
  apim: "https://azure.microsoft.com/en-us/pricing/details/api-management/",
  functions: "https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale",
  webPubSub: "https://learn.microsoft.com/en-us/azure/azure-web-pubsub/concept-performance",
  redis: "https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-best-practices-performance",
  cosmos: "https://learn.microsoft.com/en-us/azure/cosmos-db/concepts-limits",
  eventHubs: "https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-scalability",
  blob: "https://learn.microsoft.com/en-us/azure/storage/common/scalability-targets-standard-account",
};

const awsSla = (path: string, note: string): Source => ({ kind: "sla", note, url: AWS.sla(path) });
const azureSla = (note: string): Source => ({ kind: "sla", note: `${note} (Microsoft SLA for Online Services).`, url: AZURE.sla });

type ItemSpec = Omit<CatalogItem, "id" | "provider" | "name" | "category" | "blurb">;

function item(id: string, provider: Provider, name: string, category: Category, blurb: string, spec: ItemSpec): CatalogItem {
  return { id, provider, name, category, blurb, ...spec };
}

// Throughput of your own servers and databases depends on instance size, code and
// queries, so no vendor publishes it. These are the numbers you estimate in an interview.
const APP_SERVER = ASSUMED("No vendor publishes this: it depends on instance size and your code. ~500 simple requests/s per instance is a common interview estimate.");
const CONTAINER = ASSUMED("No vendor publishes this: it depends on task/pod size and your code.");
const SQL_READS = ASSUMED("No vendor publishes queries/s: it depends on instance class, IOPS and query cost.");
const SQL_WRITES = ASSUMED("Writes all go to one primary; the rate depends on instance class, IOPS and transaction size.");
const NO_LIMIT = (note: string, url?: string): Source => ({ kind: "none", note, url });

export const CATALOG: CatalogItem[] = [
  item("users", "generic", "Users", "client", "Traffic source. Load comes from the scenario.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT("Traffic source, not a service."),
    unitLabel: "",
    defaultUnits: 1,
    managed: true,
    sla: 1,
    slaSource: NO_LIMIT("Not a service."),
    monthlyCost: 0,
  }),

  // ---------------------------------------------------------------- AWS
  item("aws-route53", "aws", "Route 53", "dns", "Managed DNS with health checks and latency routing.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT("AWS publishes no query-rate quota for public hosted zones.", AWS.route53),
    unitLabel: "hosted zone",
    defaultUnits: 1,
    managed: true,
    sla: 1,
    slaSource: awsSla("route53", "100% monthly uptime commitment for hosted zones"),
    monthlyCost: 1,
  }),
  item("aws-cloudfront", "aws", "CloudFront", "cdn", "CDN that serves static and cacheable content at the edge.", {
    unitRps: 250_000,
    capacitySource: { kind: "quota", note: "Default quota: 250,000 requests/s and 150 Gbps per distribution (can be raised).", url: AWS.cloudfront },
    unitLabel: "distributions",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: awsSla("cloudfront", "99.9% monthly uptime"),
    monthlyCost: 400,
  }),
  item("aws-alb", "aws", "Application Load Balancer", "loadBalancer", "L7 load balancer across instances and AZs.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT("No request-rate quota: ALB scales automatically and is billed by capacity units (LCUs).", AWS.alb),
    unitLabel: "load balancers",
    defaultUnits: 1,
    managed: true,
    sla: 0.9999,
    slaSource: awsSla("elasticloadbalancing", "99.99% for multi-AZ load balancers"),
    monthlyCost: 60,
  }),
  item("aws-apigw", "aws", "API Gateway", "apiGateway", "Managed API front door with throttling and auth.", {
    unitRps: 10_000,
    capacitySource: {
      kind: "quota",
      note: "Default account throttle: 10,000 requests/s per region across all REST, HTTP and WebSocket APIs, burst 5,000 (can be raised).",
      url: AWS.apiGateway,
    },
    unitLabel: "× default quota",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: awsSla("api-gateway", "99.95% monthly uptime per region"),
    monthlyCost: 350,
  }),
  item("aws-ec2", "aws", "EC2 Auto Scaling", "compute", "Virtual machines running your app tier.", {
    unitRps: 500,
    capacitySource: APP_SERVER,
    unitLabel: "instances",
    defaultUnits: 2,
    managed: false,
    sla: 0.995,
    slaMultiAz: 0.9999,
    slaSource: awsSla("compute", "99.5% for a single instance; 99.99% region-level when instances run in two or more AZs"),
    monthlyCost: 70,
  }),
  item("aws-ecs", "aws", "ECS Fargate", "compute", "Serverless containers for the app tier.", {
    unitRps: 400,
    capacitySource: CONTAINER,
    unitLabel: "tasks",
    defaultUnits: 2,
    managed: false,
    sla: 0.995,
    slaMultiAz: 0.9999,
    slaSource: awsSla("ecs", "99.5% per task; 99.99% when deployed across multiple AZs"),
    monthlyCost: 50,
  }),
  item("aws-lambda", "aws", "Lambda", "serverless", "Functions that scale per request.", {
    unitRps: 10_000,
    capacitySource: {
      kind: "quota",
      note: "Default 1,000 concurrent executions per region; synchronous invocations are capped at 10× concurrency. Real throughput is concurrency ÷ average duration, up to that cap.",
      url: AWS.lambda,
    },
    unitLabel: "× 1,000 concurrency",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: awsSla("lambda", "99.95% monthly uptime per region"),
    monthlyCost: 300,
  }),
  item("aws-apigw-ws", "aws", "API Gateway WebSocket", "realtime", "Managed WebSocket connections for push.", {
    unitRps: 10_000,
    capacitySource: {
      kind: "quota",
      note: "Messages count against the shared 10,000 requests/s account throttle. Also 500 new connections/s per account (can be raised).",
      url: AWS.webSocket,
    },
    unitLabel: "× default quota",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: awsSla("api-gateway", "99.95% monthly uptime per region"),
    monthlyCost: 250,
  }),
  item("aws-elasticache", "aws", "ElastiCache Redis", "cache", "In-memory cache for hot reads and sessions.", {
    unitRps: 100_000,
    capacitySource: ASSUMED("AWS publishes no per-node operations/s. ~100k simple GET/SET per node is a common order-of-magnitude estimate."),
    unitLabel: "nodes",
    defaultUnits: 1,
    managed: false,
    sla: 0.995,
    slaMultiAz: 0.9999,
    slaSource: awsSla("elasticache", "99.5% single-AZ; 99.99% Multi-AZ (primary and replica in different AZs)"),
    monthlyCost: 120,
  }),
  item("aws-rds", "aws", "RDS PostgreSQL", "sqlDb", "Relational DB. One primary for writes, replicas for reads.", {
    unitRps: 5_000,
    capacitySource: SQL_READS,
    unitWriteRps: 2_000,
    writeSource: SQL_WRITES,
    writesScale: false,
    unitLabel: "replicas",
    defaultUnits: 1,
    managed: false,
    sla: 0.995,
    slaMultiAz: 0.9995,
    slaSource: awsSla("rds", "99.5% single-AZ instance; 99.95% Multi-AZ"),
    monthlyCost: 350,
  }),
  item("aws-aurora", "aws", "Aurora PostgreSQL", "sqlDb", "Cloud-native relational DB with up to 15 replicas.", {
    unitRps: 8_000,
    capacitySource: SQL_READS,
    unitWriteRps: 5_000,
    writeSource: SQL_WRITES,
    writesScale: false,
    unitLabel: "replicas",
    defaultUnits: 1,
    managed: false,
    sla: 0.999,
    slaMultiAz: 0.9999,
    slaSource: awsSla("rds/aurora", "99.9% single-AZ cluster; 99.99% Multi-AZ cluster"),
    monthlyCost: 500,
  }),
  item("aws-dynamodb", "aws", "DynamoDB", "nosqlDb", "Key-value store that scales by partition.", {
    unitRps: 40_000,
    capacitySource: {
      kind: "quota",
      note: "Default table quota: 40,000 read and 40,000 write units/s (can be raised). 1 read unit = one strongly consistent read ≤ 4 KB. Each partition also tops out at 3,000 reads / 1,000 writes per second, so hot keys hit limits sooner.",
      url: AWS.dynamo,
    },
    unitWriteRps: 40_000,
    writeSource: { kind: "quota", note: "Default table quota: 40,000 write units/s. 1 write unit = one write ≤ 1 KB.", url: AWS.dynamo },
    writesScale: true,
    unitLabel: "× default table quota",
    defaultUnits: 1,
    managed: true,
    sla: 0.9999,
    slaSource: awsSla("dynamodb", "99.99% standard; 99.999% with global tables"),
    monthlyCost: 400,
  }),
  item("aws-sqs", "aws", "SQS", "queue", "Queue that decouples producers from workers.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT(
      "Standard queues support a nearly unlimited API rate. FIFO queues are limited to 300 transactions/s per partition (3,000 msg/s with batching) unless high-throughput mode is on.",
      AWS.sqs
    ),
    unitLabel: "queues",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: awsSla("messaging", "99.9% monthly uptime per region"),
    monthlyCost: 40,
  }),
  item("aws-kinesis", "aws", "Kinesis", "queue", "Ordered event stream, scaled by shards.", {
    unitRps: 1_000,
    capacitySource: { kind: "quota", note: "Each shard accepts up to 1,000 records/s or 1 MB/s of writes (reads: 2 MB/s).", url: AWS.kinesis },
    unitLabel: "shards",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: awsSla("kinesis", "99.9% monthly uptime per region"),
    monthlyCost: 15,
  }),
  item("aws-s3", "aws", "S3", "objectStorage", "Durable object storage for media and files.", {
    unitRps: 5_500,
    capacitySource: {
      kind: "quota",
      note: "At least 5,500 GET/HEAD requests/s per partitioned prefix, with no limit on prefixes. Scaling up is gradual.",
      url: AWS.s3,
    },
    unitWriteRps: 3_500,
    writeSource: { kind: "quota", note: "At least 3,500 PUT/COPY/POST/DELETE requests/s per partitioned prefix.", url: AWS.s3 },
    writesScale: true,
    unitLabel: "prefixes",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: awsSla("s3", "99.9% for S3 Standard (its 99.99% figure is design availability, not the SLA)"),
    monthlyCost: 200,
  }),
  item("aws-opensearch", "aws", "OpenSearch", "search", "Full-text search and analytics cluster.", {
    unitRps: 1_000,
    capacitySource: ASSUMED("AWS publishes no queries/s per node: it depends on instance type, index size and query complexity."),
    unitLabel: "nodes",
    defaultUnits: 2,
    managed: false,
    sla: 0.995,
    slaMultiAz: 0.999,
    slaSource: awsSla("opensearch-service", "99.5% single-AZ; 99.9% Multi-AZ without standby (99.99% with standby)"),
    monthlyCost: 250,
  }),
  item("aws-cloudwatch", "aws", "CloudWatch", "monitoring", "Metrics, logs and alarms.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT("Not on the request path in this model."),
    unitLabel: "",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: awsSla("cloudwatch", "99.9% monthly uptime"),
    monthlyCost: 100,
  }),

  // ---------------------------------------------------------------- Azure
  item("az-dns", "azure", "Azure DNS", "dns", "Managed DNS hosting.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT("Microsoft publishes no query-rate limit for Azure DNS public zones."),
    unitLabel: "zone",
    defaultUnits: 1,
    managed: true,
    sla: 1,
    slaSource: azureSla("100% for valid DNS requests"),
    monthlyCost: 1,
  }),
  item("az-frontdoor", "azure", "Front Door", "cdn", "Global edge: CDN, WAF and global load balancing.", {
    unitRps: 100_000,
    capacitySource: {
      kind: "quota",
      note: "Standard/Premium: 100,000 requests/s and 75 Gbps per profile, and 5,000 requests/s per point of presence (can be raised).",
      url: AZURE.frontDoor,
    },
    unitLabel: "profiles",
    defaultUnits: 1,
    managed: true,
    sla: 0.9999,
    slaSource: azureSla("99.99%"),
    monthlyCost: 400,
  }),
  item("az-appgw", "azure", "Application Gateway", "loadBalancer", "Regional L7 load balancer with WAF.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT(
      "No requests/s figure published. v2 autoscales up to 125 instances of ~10 capacity units each (a unit is defined by connections, throughput and compute).",
      AZURE.appGateway
    ),
    unitLabel: "gateways",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: azureSla("99.95%"),
    monthlyCost: 60,
  }),
  item("az-apim", "azure", "API Management", "apiGateway", "API gateway with policies and throttling.", {
    unitRps: 2_500,
    capacitySource: {
      kind: "benchmark",
      note: "Microsoft's estimated maximum for one Standard unit (Basic 1,000, Premium 4,000). Published 'for information only', not a limit or guarantee.",
      url: AZURE.apim,
    },
    unitLabel: "units",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: azureSla("99.95% in one region; 99.99% for Premium across two or more regions"),
    monthlyCost: 350,
  }),
  item("az-appservice", "azure", "App Service", "compute", "Managed platform for web apps and APIs.", {
    unitRps: 500,
    capacitySource: ASSUMED("Microsoft publishes plan limits (up to 10 instances on Standard, 30 on Premium by default), not requests/s. Throughput per instance depends on plan size and your code."),
    unitLabel: "instances",
    defaultUnits: 2,
    managed: false,
    sla: 0.9995,
    slaMultiAz: 0.9999,
    slaSource: azureSla("99.95% without availability zones; 99.99% across two or more zones"),
    monthlyCost: 70,
  }),
  item("az-vmss", "azure", "VM Scale Sets", "compute", "Autoscaling virtual machines.", {
    unitRps: 500,
    capacitySource: APP_SERVER,
    unitLabel: "instances",
    defaultUnits: 2,
    managed: false,
    sla: 0.999,
    slaMultiAz: 0.9999,
    slaSource: azureSla("99.9% single VM on Premium SSD; 99.99% across two or more availability zones"),
    monthlyCost: 70,
  }),
  item("az-aks", "azure", "AKS", "compute", "Managed Kubernetes for the app tier.", {
    unitRps: 400,
    capacitySource: CONTAINER,
    unitLabel: "pods",
    defaultUnits: 2,
    managed: false,
    sla: 0.999,
    slaMultiAz: 0.9999,
    slaSource: azureSla("AKS's own SLA covers only the Kubernetes API server; your pods run on VMs: 99.9% single VM, 99.99% across zones"),
    monthlyCost: 50,
  }),
  item("az-functions", "azure", "Azure Functions", "serverless", "Event-driven serverless functions.", {
    unitRps: 10_000,
    capacitySource: ASSUMED(
      "Microsoft publishes instance limits (Flex Consumption scales to 1,000 instances), not requests/s. Throughput depends on your code and per-instance concurrency."
    ),
    unitLabel: "scale units",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: azureSla("99.95%"),
    monthlyCost: 300,
  }),
  item("az-webpubsub", "azure", "Web PubSub", "realtime", "Managed WebSocket fan-out.", {
    unitRps: 500,
    capacitySource: {
      kind: "benchmark",
      note: "1 unit = 1,000 connections. Microsoft's benchmark shows ~500 echo messages/s per unit (2 KB messages); fan-out patterns differ. Not a hard limit.",
      url: AZURE.webPubSub,
    },
    unitLabel: "units",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: azureSla("99.9% for the Standard tier"),
    monthlyCost: 250,
  }),
  item("az-redis", "azure", "Azure Cache for Redis", "cache", "Managed Redis cache (being retired in favor of Azure Managed Redis).", {
    unitRps: 172_000,
    capacitySource: {
      kind: "benchmark",
      note: "Microsoft's benchmark for one Premium P1 shard: 172,000 GET/s with TLS (1 KB values, pipelined). Not guaranteed; real throughput at acceptable latency is lower.",
      url: AZURE.redis,
    },
    unitLabel: "P1 shards",
    defaultUnits: 1,
    managed: false,
    sla: 0.999,
    slaMultiAz: 0.9999,
    slaSource: azureSla("99.9% for Standard/Premium; 99.99% for Enterprise tiers across three or more zones"),
    monthlyCost: 120,
  }),
  item("az-sql", "azure", "Azure SQL Database", "sqlDb", "Managed SQL Server with read replicas.", {
    unitRps: 5_000,
    capacitySource: SQL_READS,
    unitWriteRps: 2_000,
    writeSource: SQL_WRITES,
    writesScale: false,
    unitLabel: "replicas",
    defaultUnits: 1,
    managed: false,
    sla: 0.9999,
    slaMultiAz: 0.99995,
    slaSource: azureSla("99.99% without zone redundancy; 99.995% zone-redundant"),
    monthlyCost: 350,
  }),
  item("az-postgres", "azure", "Azure DB for PostgreSQL", "sqlDb", "Managed PostgreSQL flexible server.", {
    unitRps: 5_000,
    capacitySource: SQL_READS,
    unitWriteRps: 2_000,
    writeSource: SQL_WRITES,
    writesScale: false,
    unitLabel: "replicas",
    defaultUnits: 1,
    managed: false,
    sla: 0.999,
    slaMultiAz: 0.9999,
    slaSource: azureSla("99.9% without HA; 99.95% same-zone HA; 99.99% zone-redundant HA"),
    monthlyCost: 350,
  }),
  item("az-cosmos", "azure", "Cosmos DB", "nosqlDb", "Globally distributed multi-model NoSQL.", {
    unitRps: 10_000,
    capacitySource: {
      kind: "quota",
      note: "Max 10,000 RU/s per partition (logical and physical); a 1 KB point read costs 1 RU. Up to 1,000,000 RU/s per container by default.",
      url: AZURE.cosmos,
    },
    unitWriteRps: 2_000,
    writeSource: ASSUMED("Microsoft publishes no fixed RU cost for writes (it grows with item size and indexing). Assumes ~5 RU per 1 KB write."),
    writesScale: true,
    unitLabel: "partitions",
    defaultUnits: 1,
    managed: true,
    sla: 0.9999,
    slaSource: azureSla("99.99% single region; 99.995% with zone redundancy; 99.999% multi-region"),
    monthlyCost: 400,
  }),
  item("az-servicebus", "azure", "Service Bus", "queue", "Enterprise message broker.", {
    unitRps: 4_000,
    capacitySource: ASSUMED("Microsoft publishes no fixed messages/s per Premium messaging unit: it depends on message size, protocol and features used."),
    unitLabel: "messaging units",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: azureSla("99.9%; 99.99% for Premium in regions with availability zones"),
    monthlyCost: 670,
  }),
  item("az-eventhubs", "azure", "Event Hubs", "queue", "Event streaming, scaled by throughput units.", {
    unitRps: 1_000,
    capacitySource: {
      kind: "quota",
      note: "1 throughput unit = up to 1,000 events/s or 1 MB/s in, and 4,096 events/s or 2 MB/s out.",
      url: AZURE.eventHubs,
    },
    unitLabel: "throughput units",
    defaultUnits: 1,
    managed: true,
    sla: 0.9995,
    slaSource: azureSla("99.95% Basic/Standard; 99.99% Premium/Dedicated"),
    monthlyCost: 22,
  }),
  item("az-blob", "azure", "Blob Storage", "objectStorage", "Object storage for media and files.", {
    unitRps: 20_000,
    capacitySource: {
      kind: "quota",
      note: "Default max 20,000 requests/s per storage account (40,000 in major regions such as East US and West Europe); can be raised.",
      url: AZURE.blob,
    },
    unitLabel: "storage accounts",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: azureSla("99.9% for Hot tier (LRS/ZRS/GRS write requests)"),
    monthlyCost: 200,
  }),
  item("az-search", "azure", "Azure AI Search", "search", "Managed search index.", {
    unitRps: 1_000,
    capacitySource: ASSUMED("Microsoft publishes no queries/s per replica: it depends on tier, index size and query complexity."),
    unitLabel: "replicas",
    defaultUnits: 2,
    managed: true,
    sla: 0.999,
    slaSource: azureSla("99.9% for queries with 2+ replicas and for updates with 3+ replicas; no SLA with one replica"),
    monthlyCost: 250,
  }),
  item("az-monitor", "azure", "Azure Monitor", "monitoring", "Metrics, logs and alerts.", {
    unitRps: Infinity,
    capacitySource: NO_LIMIT("Not on the request path in this model."),
    unitLabel: "",
    defaultUnits: 1,
    managed: true,
    sla: 0.999,
    slaSource: azureSla("99.9%"),
    monthlyCost: 100,
  }),
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const CUSTOM_ID = "custom";

// Profiles for free-text components classified by Jev. Everything here is an assumption.
const CUSTOM_DEFAULTS: Record<Category, Pick<CatalogItem, "unitRps" | "unitWriteRps" | "writesScale" | "unitLabel" | "defaultUnits" | "managed" | "sla" | "slaMultiAz" | "monthlyCost">> = {
  client: { unitRps: Infinity, unitLabel: "", defaultUnits: 1, managed: true, sla: 1, monthlyCost: 0 },
  dns: { unitRps: Infinity, unitLabel: "zone", defaultUnits: 1, managed: true, sla: 0.9999, monthlyCost: 1 },
  cdn: { unitRps: 100_000, unitLabel: "profiles", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 400 },
  loadBalancer: { unitRps: Infinity, unitLabel: "load balancers", defaultUnits: 1, managed: true, sla: 0.9995, monthlyCost: 60 },
  apiGateway: { unitRps: 10_000, unitLabel: "units", defaultUnits: 1, managed: true, sla: 0.9995, monthlyCost: 350 },
  compute: { unitRps: 500, unitLabel: "instances", defaultUnits: 2, managed: false, sla: 0.995, slaMultiAz: 0.9999, monthlyCost: 70 },
  serverless: { unitRps: 10_000, unitLabel: "scale units", defaultUnits: 1, managed: true, sla: 0.9995, monthlyCost: 300 },
  realtime: { unitRps: 2_000, unitLabel: "units", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 250 },
  cache: { unitRps: 100_000, unitLabel: "nodes", defaultUnits: 1, managed: false, sla: 0.995, slaMultiAz: 0.9999, monthlyCost: 120 },
  sqlDb: { unitRps: 5_000, unitWriteRps: 2_000, writesScale: false, unitLabel: "replicas", defaultUnits: 1, managed: false, sla: 0.995, slaMultiAz: 0.9995, monthlyCost: 350 },
  nosqlDb: { unitRps: 10_000, unitWriteRps: 3_000, writesScale: true, unitLabel: "partitions", defaultUnits: 1, managed: true, sla: 0.9999, monthlyCost: 400 },
  queue: { unitRps: 10_000, unitLabel: "queues", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 40 },
  objectStorage: { unitRps: 5_000, unitLabel: "buckets", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 200 },
  search: { unitRps: 1_000, unitLabel: "nodes", defaultUnits: 2, managed: false, sla: 0.995, slaMultiAz: 0.999, monthlyCost: 250 },
  monitoring: { unitRps: Infinity, unitLabel: "", defaultUnits: 1, managed: true, sla: 0.999, monthlyCost: 100 },
};

/** Profile for a free-text component once it has been classified. */
export function customItem(name: string, category: Category): CatalogItem {
  const note = "Custom component: generic profile for its category, not tied to a vendor.";
  return item(CUSTOM_ID, "generic", name, category, `Custom component, classified as ${CATEGORY_LABELS[category]}.`, {
    ...CUSTOM_DEFAULTS[category],
    capacitySource: ASSUMED(note),
    slaSource: ASSUMED(note),
  });
}

export function resolveItem(catalogId: string, custom?: { name: string; category: Category | null }): CatalogItem | null {
  if (catalogId === CUSTOM_ID) {
    return custom?.category ? customItem(custom.name, custom.category) : null;
  }
  return CATALOG_BY_ID[catalogId] ?? null;
}
