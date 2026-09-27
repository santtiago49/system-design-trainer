"use client";

import { CircleCheck, CircleX, Eye, RotateCcw, TriangleAlert, X } from "lucide-react";
import { formatUsers, type RunReport, type Verdict } from "@/lib/run";

const VERDICTS: Record<Verdict, { label: string; className: string; Icon: typeof CircleCheck }> = {
  survives: { label: "Survives", className: "bg-ok/10 text-ok", Icon: CircleCheck },
  degraded: { label: "Degraded", className: "bg-warn/10 text-warn", Icon: TriangleAlert },
  down: { label: "Down", className: "bg-over/10 text-over", Icon: CircleX },
};

type Props = {
  report: RunReport;
  stale: boolean;
  preview: string | null;
  onPreview: (id: string | null) => void;
  onRerun: () => void;
  onClose: () => void;
};

export function RunDrawer({ report, stale, preview, onPreview, onRerun, onClose }: Props) {
  const first = report.breakpoints[0];
  const survived = report.failures.filter((f) => f.verdict === "survives").length;

  return (
    <div className="@container absolute inset-x-0 bottom-0 z-20 flex max-h-[48%] flex-col border-t border-line bg-white shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.15)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <h2 className="whitespace-nowrap text-sm font-semibold">Run results</h2>
        <span className="text-xs text-zinc-500">
          Target {formatUsers(report.users)} users · passed {survived} of {report.failures.length} scenarios
        </span>
        {stale && <span className="rounded-md bg-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-warn">Design changed since this run</span>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onRerun} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100">
            <RotateCcw className="size-3.5" /> Run again
          </button>
          <button onClick={onClose} title="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-4 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Load test: where it breaks</h3>
          {first ? (
            <>
              <p className="mt-2 text-sm">
                First failure at <b>{formatUsers(first.users)} users</b> ({(first.users / report.users).toFixed(1)}× target):{" "}
                <b>{first.name}</b> saturates.
              </p>
              <ol className="mt-3 space-y-2">
                {report.breakpoints.map((b, i) => {
                  const ratio = b.users / report.users;
                  // Log scale: 0.1× target on the left, 100× on the right.
                  const width = Math.max(4, Math.min(100, ((Math.log10(ratio) + 1) / 3) * 100));
                  const color = ratio < 1 ? "bg-over" : ratio < 2 ? "bg-warn" : "bg-ok";
                  return (
                    <li key={b.nodeId} className="text-xs">
                      <div className="flex justify-between">
                        <span className="truncate">
                          {i + 1}. {b.name}
                        </span>
                        <span className="shrink-0 text-zinc-500">
                          {formatUsers(b.users)} · {ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-zinc-100">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Connect components to Users to put them under load.</p>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Failure scenarios <span className="font-normal normal-case tracking-normal">(click one to see it on the canvas)</span>
          </h3>
          <ul className="mt-2 grid gap-2 @xl:grid-cols-2">
            {report.failures.map((f) => {
              const { label, className, Icon } = VERDICTS[f.verdict];
              const active = preview === f.id;
              return (
                <li key={f.id}>
                  <button
                    onClick={() => onPreview(active ? null : f.id)}
                    disabled={stale}
                    className={`h-full w-full rounded-lg border p-2.5 text-left transition-colors enabled:hover:border-zinc-400 ${
                      active ? "border-ink ring-1 ring-ink" : "border-line"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>
                        <Icon className="size-3" /> {label}
                      </span>
                      {active && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                          <Eye className="size-3.5" /> On canvas
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-sm font-medium">{f.title}</div>
                    <p className="mt-1 text-xs text-zinc-500">{f.description}</p>
                    <p className="mt-1 text-xs">{f.detail}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
