"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { formatNumber } from "@/lib/simulate";
import { STATUS_STYLES } from "./icons";
import { useSimulation } from "./simulation-context";

export function LoadEdge({ id, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const simulation = useSimulation();
  const rps = simulation.edges[id];
  const status = simulation.nodes[target]?.status ?? "idle";
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const flowing = rps !== undefined && rps > 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={flowing ? "edge-flow" : undefined}
        style={{ stroke: flowing ? STATUS_STYLES[status].stroke : "#c4c4bd", strokeWidth: selected ? 2.5 : 1.75 }}
      />
      {flowing && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {formatNumber(rps)} rps
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
