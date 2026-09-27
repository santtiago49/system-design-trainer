"use client";

import { Trash2 } from "lucide-react";
import { COST_SOURCE, type CatalogItem } from "@/lib/catalog";
import { formatNumber, formatPercent, type DesignNodeData, type NodeSim } from "@/lib/simulate";
import { STATUS_STYLES } from "./icons";
import { useDesignActions } from "./design-actions";
import { SourcedValue } from "./source-tag";

const USER_PRESETS = [100_000, 1_000_000, 10_000_000, 100_000_000];

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-zinc-50 px-2 py-1.5">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`text-xs font-medium ${className}`}>{value}</div>
    </div>
  );
}

function Slider({ label, value, display, min, max, step = 1, onChange }: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-zinc-600">{label}</span>
        <span className="font-medium">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="nodrag mt-1 w-full accent-ink"
      />
    </label>
  );
}

/** Target users, edited from the Users node. */
export function UsersProperties() {
  const { users, setUsers, usersLocked } = useDesignActions();
  if (usersLocked) {
    return (
      <p className="text-xs text-zinc-600">
        <span className="font-medium">{users.toLocaleString("en-US")}</span> daily active users. The level sets this number.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-zinc-600">
        Daily active users
        <input
          type="number"
          min={1000}
          step={100_000}
          value={users}
          onChange={(e) => setUsers(Math.max(1, Number(e.target.value) || 1))}
          className="nodrag mt-1 w-full rounded-md border border-line px-2 py-1 text-sm font-normal text-ink"
        />
      </label>
      <div className="flex gap-1">
        {USER_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setUsers(preset)}
            className={`flex-1 rounded-md py-0.5 text-xs ${users === preset ? "bg-ink text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
          >
            {formatNumber(preset)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NodeProperties({ id, data, item, sim }: { id: string; data: DesignNodeData; item: CatalogItem; sim: NodeSim | undefined }) {
  const { updateNode, deleteNode } = useDesignActions();
  const update = (patch: Partial<DesignNodeData>) => updateNode(id, patch);
  const carriesLoad = item.category !== "monitoring";
  const active = sim && !["idle", "down", "unclassified"].includes(sim.status);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">{item.blurb}</p>

      {carriesLoad && Number.isFinite(item.unitRps) && (
        <Slider
          label={`Units (${item.unitLabel})`}
          value={data.units}
          display={String(data.units)}
          min={1}
          max={50}
          onChange={(units) => update({ units })}
        />
      )}

      {item.category === "cache" && (
        <Slider
          label="Cache hit rate"
          value={data.hitRate}
          display={`${Math.round(data.hitRate * 100)}%`}
          min={0}
          max={0.99}
          step={0.01}
          onChange={(hitRate) => update({ hitRate })}
        />
      )}

      {!item.managed && carriesLoad && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={data.multiAz} onChange={(e) => update({ multiAz: e.target.checked })} className="nodrag accent-ink" />
          Spread across availability zones
        </label>
      )}
      {active && carriesLoad && (
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Reads" value={`${formatNumber(sim.load.reads)} rps`} />
          <Stat label="Writes" value={`${formatNumber(sim.load.writes)} rps`} />
          <Stat label="Utilization" value={`${Math.round(sim.utilization * 100)}%`} className={STATUS_STYLES[sim.status].text} />
          <Stat
            label="Supports"
            value={Number.isFinite(sim.supportedUsers) ? `${formatNumber(sim.supportedUsers)} users` : "No limit"}
            className={STATUS_STYLES[sim.status].text}
          />
          <Stat label="Uptime SLA" value={formatPercent(sim.availability)} />
          <Stat label="Cost*" value={`$${formatNumber(item.monthlyCost * data.units)}/mo`} />
        </div>
      )}

      <section className="space-y-2.5 border-t border-line pt-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Where these numbers come from</h4>
        {carriesLoad && (
          <SourcedValue
            label={item.unitWriteRps ? "Reads per unit" : "Capacity per unit"}
            value={Number.isFinite(item.unitRps) ? `${formatNumber(item.unitRps)}/s` : "—"}
            source={item.capacitySource}
          />
        )}
        {carriesLoad && item.unitWriteRps && item.writeSource && (
          <SourcedValue
            label={item.writesScale ? "Writes per unit" : "Writes (primary only)"}
            value={`${formatNumber(item.unitWriteRps)}/s`}
            source={item.writeSource}
          />
        )}
        <SourcedValue
          label="Uptime SLA"
          value={item.slaMultiAz && !item.managed ? `${formatPercent(item.sla)} · ${formatPercent(item.slaMultiAz)} multi-AZ` : formatPercent(item.sla)}
          source={item.slaSource}
        />
        <SourcedValue label="*Cost" value={`$${formatNumber(item.monthlyCost)}/unit`} source={COST_SOURCE} />
      </section>

      <button onClick={() => deleteNode(id)} className="flex items-center gap-1.5 text-xs text-over hover:underline">
        <Trash2 className="size-3.5" /> Remove component
      </button>
    </div>
  );
}
