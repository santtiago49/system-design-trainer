"use client";

import { Hand, MousePointer2, Slash, Type, type LucideIcon } from "lucide-react";

export type Tool = "select" | "hand" | "line" | "text";

const GROUPS: { id: Tool; label: string; shortcut: string; hint?: string; Icon: LucideIcon }[][] = [
  [
    { id: "select", label: "Select", shortcut: "V", Icon: MousePointer2 },
    { id: "hand", label: "Hand", shortcut: "H", hint: "or hold Space", Icon: Hand },
  ],
  [
    { id: "line", label: "Line", shortcut: "L", Icon: Slash },
    { id: "text", label: "Text", shortcut: "T", Icon: Type },
  ],
];

export const TOOL_SHORTCUTS: Record<string, Tool> = { v: "select", h: "hand", l: "line", t: "text" };

export function CanvasToolbar({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
      {GROUPS.map((group, i) => (
        <div key={i} className={`flex gap-0.5 ${i > 0 ? "border-l border-line pl-1" : ""}`}>
          {group.map(({ id, label, shortcut, hint, Icon }) => (
            <div key={id} className="group relative">
              <button
                onClick={() => onChange(id)}
                aria-label={`${label} (${shortcut})`}
                aria-pressed={tool === id}
                className={`rounded-lg p-2 transition-colors ${tool === id ? "bg-ink text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
              >
                <Icon className="size-4" />
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity delay-150 group-hover:opacity-100"
              >
                {label}
                <kbd className="rounded border border-white/20 bg-white/10 px-1 font-sans text-[11px] leading-4">{shortcut}</kbd>
                {hint && <span className="text-white/60">{hint}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
