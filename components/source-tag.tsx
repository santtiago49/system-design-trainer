"use client";

import { ExternalLink } from "lucide-react";
import type { Source, SourceKind } from "@/lib/catalog";

const KINDS: Record<SourceKind, { label: string; className: string }> = {
  quota: { label: "Official limit", className: "bg-azure/10 text-azure" },
  sla: { label: "Official SLA", className: "bg-ok/10 text-ok" },
  benchmark: { label: "Vendor benchmark", className: "bg-warn/10 text-warn" },
  assumption: { label: "Assumption", className: "bg-zinc-100 text-zinc-600" },
  none: { label: "No published limit", className: "bg-zinc-100 text-zinc-600" },
};

/** A number with a pill saying where it comes from, and the source's own note underneath. */
export function SourcedValue({ label, value, source }: { label: string; value: string; source: Source }) {
  const kind = KINDS[source.kind];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-zinc-600">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="font-medium text-ink">{value}</span>
          <span className={`rounded px-1.5 py-px text-[10px] font-medium ${kind.className}`}>{kind.label}</span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the official source"
              className="nodrag text-zinc-400 hover:text-ink"
            >
              <ExternalLink className="size-3" />
            </a>
          )}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">{source.note}</p>
    </div>
  );
}
