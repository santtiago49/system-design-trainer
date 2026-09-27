"use client";

import { useState } from "react";
import { CATALOG, CATEGORY_LABELS, CUSTOM_ID, type Category, type Provider } from "@/lib/catalog";
import { CATEGORY_ICONS, CustomIcon } from "./icons";

export const DRAG_TYPE = "application/x-sd-component";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];

function PaletteItem({ catalogId, name, hint, Icon, onAdd }: {
  catalogId: string;
  name: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
  onAdd: (catalogId: string) => void;
}) {
  return (
    <button
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, catalogId);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onAdd(catalogId)}
      title={hint}
      className="flex w-full cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-100 active:cursor-grabbing"
    >
      <Icon className="size-4 shrink-0 text-zinc-500" />
      <span className="truncate">{name}</span>
    </button>
  );
}

export function Palette({ onAdd }: { onAdd: (catalogId: string) => void }) {
  const [provider, setProvider] = useState<Exclude<Provider, "generic">>("aws");
  const items = CATALOG.filter((c) => c.provider === provider);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Components</h2>
        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs">
          {(["aws", "azure"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`rounded-md px-2 py-0.5 font-medium ${provider === p ? "bg-white shadow-sm" : "text-zinc-500"}`}
            >
              {p === "aws" ? "AWS" : "Azure"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <PaletteItem catalogId="users" name="Users" hint="Traffic source" Icon={CATEGORY_ICONS.client} onAdd={onAdd} />
        <PaletteItem
          catalogId={CUSTOM_ID}
          name="Custom (Jev classifies it)"
          hint="Any technology, e.g. Kafka or MongoDB. Jev decides its role."
          Icon={CustomIcon}
          onAdd={onAdd}
        />
        {CATEGORY_ORDER.map((category) => {
          const group = items.filter((i) => i.category === category);
          if (group.length === 0) return null;
          return (
            <div key={category} className="mt-2">
              <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-zinc-400">{CATEGORY_LABELS[category]}</div>
              {group.map((i) => (
                <PaletteItem key={i.id} catalogId={i.id} name={i.name} hint={i.blurb} Icon={CATEGORY_ICONS[i.category]} onAdd={onAdd} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
