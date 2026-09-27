"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { CATEGORY_LABELS, CUSTOM_ID, resolveItem, type Category } from "@/lib/catalog";
import { formatNumber, formatPercent, type DesignNodeData, type NodeSim } from "@/lib/simulate";
import { STATUS_STYLES } from "./icons";

type Props = {
  data: DesignNodeData;
  sim: NodeSim | undefined;
  onChange: (patch: Partial<DesignNodeData>) => void;
  onDelete: () => void;
  onClassify: (name: string) => void;
};

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`text-sm font-medium ${className}`}>{value}</div>
    </div>
  );
}

export function Inspector({ data, sim, onChange, onDelete, onClassify }: Props) {
  const item = resolveItem(data.catalogId, { name: data.customName ?? "", category: data.customCategory ?? null });
  const isCustom = data.catalogId === CUSTOM_ID;
  const [name, setName] = useState(data.customName ?? "");

  useEffect(() => setName(data.customName ?? ""), [data.customName]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-base font-semibold">{item?.name ?? "Custom component"}</div>
        {item && <p className="mt-1 text-sm text-zinc-500">{item.blurb}</p>}
      </div>

      {isCustom && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-600">Technology</label>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) onClassify(name.trim());
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kafka, MongoDB, NGINX"
              className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400"
            />
            <button
              disabled={!name.trim() || data.classifying}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {data.classifying ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Classify
            </button>
          </form>
          {data.classification && data.customCategory && (
            <p className="text-xs text-zinc-500">
              Jev{data.classification.mock ? " (mock)" : ""}: <b>{CATEGORY_LABELS[data.customCategory]}</b> with{" "}
              {Math.round(data.classification.confidence * 100)}% confidence.
              {data.classification.confidence < 0.5 && " Low confidence: check the role below."}
            </p>
          )}
          <select
            value={data.customCategory ?? ""}
            onChange={(e) => onChange({ customCategory: (e.target.value || null) as Category | null })}
            className="w-full rounded-lg border border-line px-2 py-1.5 text-sm"
          >
            <option value="">Role: not classified</option>
            {(Object.keys(CATEGORY_LABELS) as Category[])
              .filter((c) => c !== "client")
              .map((c) => (
                <option key={c} value={c}>
                  Role: {CATEGORY_LABELS[c]}
                </option>
              ))}
          </select>
        </div>
      )}

      {item && item.category !== "client" && item.category !== "monitoring" && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-zinc-600">Units ({item.unitLabel})</label>
              <span className="font-medium">{data.units}</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={data.units}
              onChange={(e) => onChange({ units: Number(e.target.value) })}
              className="mt-1 w-full accent-ink"
            />
            <div className="text-[11px] text-zinc-400">
              {formatNumber(item.unitRps)} rps per unit
              {item.unitWriteRps && ` · writes ${formatNumber(item.unitWriteRps)} rps${item.writesScale ? " per unit" : " on the primary only"}`}
            </div>
          </div>

          {!item.managed && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={data.multiAz} onChange={(e) => onChange({ multiAz: e.target.checked })} className="accent-ink" />
              Spread across availability zones
            </label>
          )}

          {item.category === "cache" && (
            <div>
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-zinc-600">Cache hit rate</label>
                <span className="font-medium">{Math.round(data.hitRate * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.99}
                step={0.01}
                value={data.hitRate}
                onChange={(e) => onChange({ hitRate: Number(e.target.value) })}
                className="mt-1 w-full accent-ink"
              />
            </div>
          )}
        </div>
      )}

      {item && sim && sim.status !== "idle" && item.category !== "client" && item.category !== "monitoring" && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Reads at peak" value={`${formatNumber(sim.load.reads)} rps`} />
          <Stat label="Writes at peak" value={`${formatNumber(sim.load.writes)} rps`} />
          <Stat label="Utilization" value={`${Math.round(sim.utilization * 100)}%`} className={STATUS_STYLES[sim.status].text} />
          <Stat label="Supports" value={`${formatNumber(sim.supportedUsers)} users`} className={STATUS_STYLES[sim.status].text} />
          <Stat label="Availability" value={formatPercent(sim.availability)} />
          <Stat label="Cost / month" value={`$${formatNumber(item.monthlyCost * data.units)}`} />
        </div>
      )}

      <button onClick={onDelete} className="flex items-center gap-1.5 text-sm text-over hover:underline">
        <Trash2 className="size-3.5" /> Remove component
      </button>
    </div>
  );
}
