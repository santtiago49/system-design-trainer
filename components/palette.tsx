"use client";

import { useState } from "react";
import { CATALOG, CATEGORY_LABELS, type Category, type Provider } from "@/lib/catalog";
import { PanelLeftClose } from "lucide-react";
import { ServiceIcon } from "./icons";

export const DRAG_TYPE = "application/x-sd-component";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];

function Tile({ catalogId, name, hint, onAdd }: {
  catalogId: string;
  name: string;
  hint: string;
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
      title={`${name}: ${hint}`}
      className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center hover:bg-zinc-100 active:cursor-grabbing"
    >
      <span className="flex size-8 items-center justify-center">
        <ServiceIcon catalogId={catalogId} category={null} size={32} />
      </span>
      <span className="line-clamp-2 text-[11px] leading-tight text-zinc-700">{name}</span>
    </button>
  );
}

export function Palette({ onAdd, onClose }: { onAdd: (catalogId: string) => void; onClose: () => void }) {
  const [provider, setProvider] = useState<Exclude<Provider, "generic">>("aws");
  const items = CATALOG.filter((c) => c.provider === provider).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Components</h2>
        <div className="flex items-center gap-1">
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
          <button onClick={onClose} title="Hide components" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="grid grid-cols-3 gap-1">
          <Tile catalogId="users" name="Users" hint="Traffic source" onAdd={onAdd} />
          {items.map((i) => (
            <Tile key={i.id} catalogId={i.id} name={i.name} hint={`${CATEGORY_LABELS[i.category]}. ${i.blurb}`} onAdd={onAdd} />
          ))}
        </div>
      </div>
    </div>
  );
}
