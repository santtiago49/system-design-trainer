"use client";

import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { CATEGORY_LABELS, resolveItem } from "@/lib/catalog";
import { formatNumber, type DesignNodeData } from "@/lib/simulate";
import { CATEGORY_ICONS, CustomIcon, PROVIDER_STYLES, ServiceIcon, STATUS_STYLES } from "./icons";
import { NodeProperties, UsersProperties } from "./node-properties";
import { useSimulation } from "./simulation-context";
import { useDesignActions } from "./design-actions";

export type DesignNode = Node<DesignNodeData, "component">;

/** Properties card that opens under the selected component; deselecting hides it. */
function PropertiesCard({ visible, title, children }: { visible: boolean; title: string; children: React.ReactNode }) {
  return (
    <NodeToolbar isVisible={visible} position={Position.Bottom} offset={10}>
      <div className="nodrag nopan nowheel max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-line bg-white p-3 text-ink shadow-lg">
        <div className="mb-2 text-sm font-semibold">{title}</div>
        {children}
      </div>
    </NodeToolbar>
  );
}

export function ComponentNode({ id, data, selected, dragging }: NodeProps<DesignNode>) {
  const simulation = useSimulation();
  const { users } = useDesignActions();
  const sim = simulation.nodes[id];
  const item = resolveItem(data.catalogId, { name: data.customName ?? "", category: data.customCategory ?? null });
  const status = STATUS_STYLES[sim?.status ?? "idle"];
  const Icon = item ? CATEGORY_ICONS[item.category] : CustomIcon;
  const isBottleneck = simulation.bottleneckId === id && sim?.status !== "ok";
  const showProperties = !!selected && !dragging;

  if (item?.category === "client") {
    return (
      <div className="w-48 rounded-xl border border-line bg-ink px-3 py-2.5 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <Icon className="size-4" />
          <span className="text-sm font-medium">Users</span>
        </div>
        <div className="mt-1.5 text-xs text-white/70">
          {formatNumber(users)} DAU target
          {simulation.users === users ? (
            ` · ${formatNumber(simulation.peakRps)} rps peak`
          ) : (
            <div className="text-amber-300">
              Testing {formatNumber(simulation.users)} users · {formatNumber(simulation.peakRps)} rps
            </div>
          )}
        </div>
        <Handle type="source" position={Position.Right} />
        <PropertiesCard visible={showProperties} title="Users">
          <UsersProperties />
        </PropertiesCard>
      </div>
    );
  }

  const provider = PROVIDER_STYLES[item?.provider ?? "generic"];
  const utilization = sim?.utilization ?? 0;

  return (
    <div
      className={`w-56 rounded-xl border bg-white shadow-sm transition-opacity ${status.border} ${isBottleneck ? "ring-2 ring-over/40" : ""} ${sim?.status === "down" ? "opacity-60" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-start gap-2.5 px-3 pt-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center">
          <ServiceIcon catalogId={data.catalogId} category={data.customCategory ?? null} size={30} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {item?.name ?? (data.customName || "Custom component")}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className={`rounded px-1 py-px font-medium ${provider.className}`}>{provider.label}</span>
            <span className="truncate">
              {item ? CATEGORY_LABELS[item.category] : "Unclassified"}
            </span>
          </div>
        </div>
        {item && item.category !== "monitoring" && (
          <div className="text-right text-[11px] leading-tight text-zinc-500">
            <div className="font-medium text-ink">×{data.units}</div>
            {data.multiAz && !item.managed && <div>multi-AZ</div>}
          </div>
        )}
      </div>

      <div className="px-3 pb-2.5 pt-2">
        {data.classifying ? (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 className="size-3 animate-spin" /> Jev is classifying…
          </div>
        ) : !item ? (
          <div className="text-xs text-zinc-400">Unclassified component</div>
        ) : sim?.status === "down" ? (
          <div className="text-xs font-medium text-over">Failed</div>
        ) : !sim || sim.status === "idle" ? (
          <div className="text-xs text-zinc-400">Not on the traffic path</div>
        ) : item.category === "monitoring" ? (
          <div className="text-xs text-zinc-500">Observes the system</div>
        ) : (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${Math.min(100, utilization * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
              <span className={`font-medium ${status.text}`}>
                {!Number.isFinite(item.unitRps)
                  ? "No published limit"
                  : sim.supportedUsers === Infinity
                    ? "No load"
                    : `Supports ~${formatNumber(sim.supportedUsers)} users`}
              </span>
              <span className="text-zinc-500">{Math.round(utilization * 100)}%</span>
            </div>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
      {item && (
        <PropertiesCard visible={showProperties} title={item.name}>
          <NodeProperties id={id} data={data} item={item} sim={sim} />
        </PropertiesCard>
      )}
    </div>
  );
}
