import {
  Activity,
  Cloud,
  Container,
  Database,
  DatabaseZap,
  Globe,
  HardDrive,
  Inbox,
  Puzzle,
  Radio,
  Search,
  Server,
  Split,
  Users,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/catalog";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  client: Users,
  dns: Globe,
  cdn: Cloud,
  loadBalancer: Split,
  apiGateway: Waypoints,
  compute: Server,
  serverless: Zap,
  realtime: Radio,
  cache: DatabaseZap,
  sqlDb: Database,
  nosqlDb: Container,
  queue: Inbox,
  objectStorage: HardDrive,
  search: Search,
  monitoring: Activity,
};

export const CustomIcon = Puzzle;

export const PROVIDER_STYLES = {
  aws: { label: "AWS", className: "bg-aws/10 text-aws" },
  azure: { label: "Azure", className: "bg-azure/10 text-azure" },
  generic: { label: "Generic", className: "bg-zinc-100 text-zinc-600" },
} as const;

export const STATUS_STYLES = {
  idle: { text: "text-zinc-400", bar: "bg-zinc-300", border: "border-line", stroke: "#c4c4bd" },
  unclassified: { text: "text-zinc-400", bar: "bg-zinc-300", border: "border-dashed border-zinc-300", stroke: "#c4c4bd" },
  ok: { text: "text-ok", bar: "bg-ok", border: "border-line", stroke: "#15803d" },
  warn: { text: "text-warn", bar: "bg-warn", border: "border-warn/50", stroke: "#b45309" },
  over: { text: "text-over", bar: "bg-over", border: "border-over/60", stroke: "#dc2626" },
  down: { text: "text-over", bar: "bg-over", border: "border-dashed border-over", stroke: "#e5a3a3" },
} as const;

/** Official AWS/Azure icon for a catalog item; falls back to the category glyph for custom components. */
export function ServiceIcon({ catalogId, category, size = 24 }: { catalogId: string; category: Category | null; size?: number }) {
  if (catalogId === "custom") {
    const Icon = category ? CATEGORY_ICONS[category] : CustomIcon;
    return <Icon className="text-zinc-600" style={{ width: size * 0.75, height: size * 0.75 }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/icons/${catalogId}.svg`} alt="" width={size} height={size} draggable={false} />;
}
