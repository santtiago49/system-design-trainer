import "server-only";

import { DefaultAzureCredential } from "@azure/identity";
import { ResourceGraphClient } from "@azure/arm-resourcegraph";
import type { AzureImport, ImportedEdge, ImportedResource } from "../azure-import";

// Locally this resolves to the developer's `az login` session; in production the
// same code picks up a managed identity or workload identity. Nothing is stored.
const credential = new DefaultAzureCredential();
const graph = new ResourceGraphClient(credential);

const ARM = "https://management.azure.com";

async function query<T>(kql: string, subscriptions?: string[]): Promise<T[]> {
  const rows: T[] = [];
  let skipToken: string | undefined;
  do {
    const page = await graph.resources({
      query: kql,
      subscriptions,
      options: { resultFormat: "objectArray", top: 1000, skipToken },
    });
    rows.push(...(page.data as T[]));
    skipToken = page.skipToken;
  } while (skipToken);
  return rows;
}

async function armGet<T>(path: string, apiVersion: string): Promise<T | null> {
  const token = await credential.getToken(`${ARM}/.default`);
  const res = await fetch(`${ARM}${path}?api-version=${apiVersion}`, {
    headers: { Authorization: `Bearer ${token.token}` },
  });
  return res.ok ? ((await res.json()) as T) : null;
}

export async function listSubscriptions(): Promise<{ id: string; name: string }[]> {
  const rows = await query<{ subscriptionId: string; name: string }>(
    "ResourceContainers | where type == 'microsoft.resources/subscriptions' | project subscriptionId, name | order by name asc"
  );
  return rows.map((r) => ({ id: r.subscriptionId, name: r.name }));
}

type Row = {
  id: string;
  name: string;
  type: string;
  kind: string | null;
  resourceGroup: string;
  sku: { name?: string; tier?: string; capacity?: number } | null;
  zones: string[] | null;
  properties: Record<string, unknown> | null;
};

const MONITORING = ["microsoft.insights/components", "microsoft.operationalinsights/workspaces"];

// Configuration and plumbing that never sits on a request path.
const SUPPORTING = [
  "microsoft.web/serverfarms",
  "microsoft.web/connections",
  "microsoft.web/sites/slots",
  "microsoft.sql/servers",
  "microsoft.alertsmanagement/smartdetectoralertrules",
  "microsoft.insights/metricalerts",
  "microsoft.insights/activitylogalerts",
  "microsoft.insights/actiongroups",
  "microsoft.insights/autoscalesettings",
  "microsoft.network/publicipaddresses",
  "microsoft.network/networksecuritygroups",
  "microsoft.network/networkinterfaces",
  "microsoft.network/networkwatchers",
  "microsoft.network/virtualnetworks",
  "microsoft.network/privatednszones",
  "microsoft.network/privatednszones/virtualnetworklinks",
  "microsoft.network/privateendpoints",
  "microsoft.compute/disks",
  "microsoft.compute/sshpublickeys",
  "microsoft.compute/virtualmachines/extensions",
  "microsoft.managedidentity/userassignedidentities",
  "microsoft.portal/dashboards",
  "microsoft.operationsmanagement/solutions",
  "microsoft.cdn/profiles/afdendpoints",
  "microsoft.eventgrid/systemtopics",
  "microsoft.visualstudio/account",
];

const MAPPED_TYPES = [
  "microsoft.web/sites",
  "microsoft.compute/virtualmachinescalesets",
  "microsoft.containerservice/managedclusters",
  "microsoft.network/applicationgateways",
  "microsoft.cdn/profiles",
  "microsoft.network/frontdoors",
  "microsoft.apimanagement/service",
  "microsoft.sql/servers/databases",
  "microsoft.dbforpostgresql/flexibleservers",
  "microsoft.documentdb/databaseaccounts",
  "microsoft.cache/redis",
  "microsoft.servicebus/namespaces",
  "microsoft.eventhub/namespaces",
  "microsoft.storage/storageaccounts",
  "microsoft.search/searchservices",
  "microsoft.signalrservice/webpubsub",
  "microsoft.network/dnszones",
];

const zoned = (zones: string[] | null) => (zones?.length ?? 0) >= 2;
const get = <T>(obj: unknown, ...path: string[]): T | undefined =>
  path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj) as T | undefined;

/** One Resource Graph row → a catalog component, or null when we don't model it. */
function mapRow(row: Row, plans: Map<string, Row>): Omit<ImportedResource, "hosts"> | null {
  const base = { azureId: row.id, name: row.name, resourceGroup: row.resourceGroup, type: row.type, sku: row.sku?.name ?? null };
  const cap = Math.max(1, row.sku?.capacity ?? 1);
  switch (row.type) {
    case "microsoft.web/sites": {
      if (row.kind?.includes("functionapp")) return { ...base, catalogId: "az-functions", units: 1, multiAz: false };
      // Instance count and zone redundancy live on the App Service plan, not the app.
      const plan = plans.get(String(get(row.properties, "serverFarmId") ?? "").toLowerCase());
      return {
        ...base,
        catalogId: "az-appservice",
        units: Math.max(1, plan?.sku?.capacity ?? 1),
        multiAz: get<boolean>(plan?.properties, "zoneRedundant") === true,
        sku: plan?.sku?.name ?? null,
      };
    }
    case "microsoft.compute/virtualmachinescalesets":
      return { ...base, catalogId: "az-vmss", units: cap, multiAz: zoned(row.zones) };
    case "microsoft.containerservice/managedclusters": {
      const pools = get<{ count?: number; availabilityZones?: string[] }[]>(row.properties, "agentPoolProfiles") ?? [];
      return {
        ...base,
        catalogId: "az-aks",
        units: Math.max(1, pools.reduce((n, p) => n + (p.count ?? 0), 0)),
        multiAz: pools.some((p) => (p.availabilityZones?.length ?? 0) >= 2),
      };
    }
    case "microsoft.network/applicationgateways":
      return { ...base, catalogId: "az-appgw", units: 1, multiAz: zoned(row.zones) };
    case "microsoft.cdn/profiles":
      // Only Front Door SKUs; classic CDN profiles aren't in the catalog yet.
      return row.sku?.name?.includes("AzureFrontDoor") ? { ...base, catalogId: "az-frontdoor", units: 1, multiAz: false } : null;
    case "microsoft.network/frontdoors":
      return { ...base, catalogId: "az-frontdoor", units: 1, multiAz: false };
    case "microsoft.apimanagement/service":
      return { ...base, catalogId: "az-apim", units: cap, multiAz: zoned(row.zones) };
    case "microsoft.sql/servers/databases":
      if (row.name === "master") return null;
      return { ...base, catalogId: "az-sql", units: 1, multiAz: get<boolean>(row.properties, "zoneRedundant") === true };
    case "microsoft.dbforpostgresql/flexibleservers":
      return {
        ...base,
        catalogId: "az-postgres",
        units: 1,
        multiAz: get<string>(row.properties, "highAvailability", "mode") === "ZoneRedundant",
      };
    case "microsoft.documentdb/databaseaccounts": {
      const locations = get<{ isZoneRedundant?: boolean }[]>(row.properties, "locations") ?? [];
      return { ...base, catalogId: "az-cosmos", units: 1, multiAz: locations.some((l) => l.isZoneRedundant) };
    }
    case "microsoft.cache/redis":
      return { ...base, catalogId: "az-redis", units: Math.max(1, get<number>(row.properties, "shardCount") ?? 1), multiAz: zoned(row.zones) };
    case "microsoft.servicebus/namespaces":
      return { ...base, catalogId: "az-servicebus", units: cap, multiAz: false };
    case "microsoft.eventhub/namespaces":
      return { ...base, catalogId: "az-eventhubs", units: cap, multiAz: false };
    case "microsoft.storage/storageaccounts":
      return { ...base, catalogId: "az-blob", units: 1, multiAz: (row.sku?.name ?? "").includes("ZRS") };
    case "microsoft.search/searchservices":
      return { ...base, catalogId: "az-search", units: Math.max(1, get<number>(row.properties, "replicaCount") ?? 1), multiAz: false };
    case "microsoft.signalrservice/webpubsub":
      return { ...base, catalogId: "az-webpubsub", units: cap, multiAz: false };
    case "microsoft.network/dnszones":
      return { ...base, catalogId: "az-dns", units: 1, multiAz: false };
    default:
      return null;
  }
}

/** Host names a resource answers on, used to match gateway backends and Front Door origins. */
function hostsOf(row: Row): string[] {
  const hosts = new Set<string>();
  const add = (h: unknown) => typeof h === "string" && h && hosts.add(h.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  add(get(row.properties, "defaultHostName"));
  for (const h of get<string[]>(row.properties, "hostNames") ?? []) add(h);
  for (const url of Object.values(get<Record<string, string>>(row.properties, "primaryEndpoints") ?? {})) add(url);
  if (row.type === "microsoft.apimanagement/service") add(`${row.name}.azure-api.net`);
  return [...hosts];
}

export async function importSubscription(subscriptionId: string): Promise<AzureImport> {
  const subs = [subscriptionId];
  const [rows, plans, counts, subscriptionName] = await Promise.all([
    query<Row>(
      `Resources | where type in~ (${MAPPED_TYPES.map((t) => `'${t}'`).join(", ")}) | project id, name, type, kind, resourceGroup, sku, zones, properties`,
      subs
    ),
    query<Row>("Resources | where type == 'microsoft.web/serverfarms' | project id, name, type, kind, resourceGroup, sku, zones, properties", subs),
    query<{ type: string; n: number }>("Resources | summarize n = count() by type", subs),
    query<{ name: string }>(`ResourceContainers | where type == 'microsoft.resources/subscriptions' and subscriptionId == '${subscriptionId}' | project name`),
  ]);

  const planById = new Map(plans.map((p) => [p.id.toLowerCase(), p]));
  const resources: ImportedResource[] = [];
  const unmapped = new Map<string, number>();
  for (const row of rows) {
    // master is a system database every logical server has.
    if (row.type === "microsoft.sql/servers/databases" && row.name === "master") continue;
    const mapped = mapRow(row, planById);
    if (mapped) resources.push({ ...mapped, hosts: hostsOf(row) });
    else unmapped.set(row.type, (unmapped.get(row.type) ?? 0) + 1);
  }

  // Everything we don't model is reported, never dropped silently.
  let supporting = 0;
  const monitoring = counts.filter((c) => MONITORING.includes(c.type)).reduce((n, c) => n + c.n, 0);
  for (const c of counts) {
    if (MONITORING.includes(c.type) || MAPPED_TYPES.includes(c.type)) continue;
    if (SUPPORTING.includes(c.type)) supporting += c.n;
    else unmapped.set(c.type, (unmapped.get(c.type) ?? 0) + c.n);
  }

  const edges = await inferEdges(rows, resources);

  return {
    subscriptionId,
    subscriptionName: subscriptionName[0]?.name ?? subscriptionId,
    importedAt: new Date().toISOString(),
    resources,
    edges,
    monitoring,
    supporting,
    unmapped: [...unmapped].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    totalResources: counts.reduce((n, c) => n + c.n, 0),
  };
}

/**
 * The one topology source in the tracer bullet: Application Gateway backends and
 * Front Door origins name host names, which we match to the resources that serve them.
 */
async function inferEdges(rows: Row[], resources: ImportedResource[]): Promise<ImportedEdge[]> {
  const byHost = new Map<string, string>();
  for (const r of resources) for (const h of r.hosts) byHost.set(h, r.azureId);
  const edges: ImportedEdge[] = [];
  const link = (source: string, host: string, via: string) => {
    const target = byHost.get(host.toLowerCase());
    if (target && target !== source) edges.push({ source, target, via });
  };

  for (const row of rows) {
    if (row.type === "microsoft.network/applicationgateways") {
      const pools = get<{ properties?: { backendAddresses?: { fqdn?: string }[] } }[]>(row.properties, "backendAddressPools") ?? [];
      for (const pool of pools) for (const a of pool.properties?.backendAddresses ?? []) if (a.fqdn) link(row.id, a.fqdn, "gateway backend");
    }
    if (row.type === "microsoft.cdn/profiles" && row.sku?.name?.includes("AzureFrontDoor")) {
      const groups = await armGet<{ value: { name: string }[] }>(`${row.id}/originGroups`, "2024-02-01");
      for (const g of groups?.value ?? []) {
        const origins = await armGet<{ value: { properties: { hostName: string } }[] }>(`${row.id}/originGroups/${g.name}/origins`, "2024-02-01");
        for (const o of origins?.value ?? []) link(row.id, o.properties.hostName, "Front Door origin");
      }
    }
  }
  return edges;
}
