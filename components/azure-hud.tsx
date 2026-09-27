"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Cloud, Loader2, Plug, RefreshCw } from "lucide-react";
import type { AzureImport } from "@/lib/azure-import";

/** Microsoft's four-square mark, as its sign-in button guidelines use. */
export function MicrosoftLogo({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Summary of an imported subscription on the canvas: what was mapped, and what wasn't. */
export function AzureHud({ result, reimporting, onReimport }: { result: AzureImport; reimporting: boolean; onReimport: () => void }) {
  const [open, setOpen] = useState(true);
  const unmappedCount = result.unmapped.reduce((n, u) => n + u.count, 0);

  return (
    <div className="w-80 rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Cloud className="size-4 text-azure" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-zinc-400">Imported from Azure</div>
          <div className="truncate text-sm font-semibold">{result.subscriptionName}</div>
        </div>
        <button onClick={() => setOpen(!open)} title={open ? "Collapse" : "Expand"} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {open && (
        <div className="space-y-3 px-3 pb-3 pt-2 text-xs">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Resources in subscription" value={result.totalResources} />
            <Stat label="On the canvas" value={result.resources.length + (result.monitoring ? 1 : 0)} />
            <Stat label="Connections inferred" value={result.edges.length} />
            <Stat label="Supporting (not drawn)" value={result.supporting} />
          </div>
          <p className="text-zinc-500">
            Connections come only from Front Door origins and Application Gateway backends. Draw the rest, and connect Users to your entry points.
          </p>

          {unmappedCount > 0 && (
            <div>
              <div className="mb-1 font-semibold text-zinc-600">Not modeled yet ({unmappedCount})</div>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {result.unmapped.map((u) => (
                  <li key={u.type} className="flex justify-between gap-2 text-zinc-500">
                    <span className="truncate font-mono text-[11px]">{u.type.replace("microsoft.", "")}</span>
                    <span>{u.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-line pt-2 text-zinc-600">
            <button onClick={onReimport} disabled={reimporting} className="flex items-center gap-1 whitespace-nowrap hover:text-ink disabled:opacity-50">
              {reimporting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Re-import
            </button>
            <Link href="/integrations" className="flex items-center gap-1 whitespace-nowrap hover:text-ink">
              <Plug className="size-3.5" /> Integrations
            </Link>
            <span className="ml-auto whitespace-nowrap text-[11px] text-zinc-400">
              {new Date(result.importedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 px-2 py-1.5">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
