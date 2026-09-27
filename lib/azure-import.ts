import type { Category } from "./catalog";
import { resolveItem } from "./catalog";

/** What the server returns for one imported subscription. */
export type ImportedResource = {
  azureId: string;
  name: string;
  resourceGroup: string;
  type: string;
  sku: string | null;
  catalogId: string;
  units: number;
  multiAz: boolean;
  hosts: string[];
};

export type ImportedEdge = { source: string; target: string; via: string };

export type AzureImport = {
  subscriptionId: string;
  subscriptionName: string;
  importedAt: string;
  resources: ImportedResource[];
  edges: ImportedEdge[];
  // Application Insights and Log Analytics, shown as one monitoring node.
  monitoring: number;
  // Alerts, IPs, NSGs, slots and other plumbing that never carries requests.
  supporting: number;
  // Services that could carry traffic but aren't in the catalog yet.
  unmapped: { type: string; count: number }[];
  totalResources: number;
};

// Left-to-right columns, roughly the order a request travels.
const COLUMN: Record<Category, number> = {
  client: 0,
  dns: 1,
  cdn: 1,
  loadBalancer: 2,
  apiGateway: 2,
  compute: 3,
  serverless: 3,
  realtime: 3,
  queue: 4,
  cache: 4,
  sqlDb: 5,
  nosqlDb: 5,
  objectStorage: 5,
  search: 5,
  monitoring: 6,
};

export type LaidOutResource = ImportedResource & { position: { x: number; y: number } };

const ROWS_PER_COLUMN = 8;
const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 130;

/**
 * Places resources in tier columns, left to right in request order, grouped by
 * resource group. A tall tier wraps into extra columns every 8 components.
 */
export function layout(resources: ImportedResource[]): LaidOutResource[] {
  const tiers = new Map<number, ImportedResource[]>();
  for (const r of resources) {
    const category = resolveItem(r.catalogId)?.category ?? "compute";
    const tier = COLUMN[category];
    tiers.set(tier, [...(tiers.get(tier) ?? []), r]);
  }
  const placed: LaidOutResource[] = [];
  let x = 0;
  for (const tier of [...tiers.keys()].sort((a, b) => a - b)) {
    const items = tiers
      .get(tier)!
      .sort((a, b) => a.resourceGroup.localeCompare(b.resourceGroup) || a.name.localeCompare(b.name));
    items.forEach((r, i) => {
      placed.push({ ...r, position: { x: x + Math.floor(i / ROWS_PER_COLUMN) * COLUMN_WIDTH, y: (i % ROWS_PER_COLUMN) * ROW_HEIGHT } });
    });
    x += Math.ceil(items.length / ROWS_PER_COLUMN) * COLUMN_WIDTH + 80;
  }
  return placed;
}

/** Where the monitoring node goes: right of everything else. */
export function monitoringPosition(placed: LaidOutResource[]): { x: number; y: number } {
  return { x: Math.max(0, ...placed.map((p) => p.position.x)) + COLUMN_WIDTH + 80, y: 0 };
}
