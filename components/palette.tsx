"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, List, PanelLeftClose } from "lucide-react";
import { CATALOG, CATEGORY_LABELS, type Category, type Provider } from "@/lib/catalog";
import { ServiceIcon } from "./icons";

export const DRAG_TYPE = "application/x-sd-component";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];
const VIEW_KEY = "sdt:palette-view";

type View = "grid" | "list";

function Tile({ catalogId, name, category, hint, view, onAdd }: {
  catalogId: string;
  name: string;
  category: string;
  hint: string;
  view: View;
  onAdd: (catalogId: string) => void;
}) {
  const drag = {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, catalogId);
      event.dataTransfer.effectAllowed = "move";
    },
    onClick: () => onAdd(catalogId),
    title: `${name}: ${hint}`,
  };

  if (view === "list") {
    return (
      <button {...drag} className="flex w-full cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100 active:cursor-grabbing">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <ServiceIcon catalogId={catalogId} category={null} size={24} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">{name}</span>
        <span className="shrink-0 text-[11px] text-zinc-400">{category}</span>
      </button>
    );
  }

  return (
    <button {...drag} className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center hover:bg-zinc-100 active:cursor-grabbing">
      <span className="flex size-8 items-center justify-center">
        <ServiceIcon catalogId={catalogId} category={null} size={32} />
      </span>
      <span className="line-clamp-2 text-[11px] leading-tight text-zinc-700">{name}</span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: React.ReactNode; title: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex items-center rounded-md px-1.5 py-0.5 font-medium ${value === o.value ? "bg-white shadow-sm" : "text-zinc-500"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Palette({ onAdd, onClose }: { onAdd: (catalogId: string) => void; onClose: () => void }) {
  const [provider, setProvider] = useState<Exclude<Provider, "generic">>("aws");
  const [view, setView] = useState<View>("grid");
  const items = CATALOG.filter((c) => c.provider === provider).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Components</h2>
        <div className="flex items-center gap-1.5">
          <Segmented
            value={provider}
            onChange={setProvider}
            options={[
              { value: "aws", label: "AWS", title: "AWS services" },
              { value: "azure", label: "Azure", title: "Azure services" },
            ]}
          />
          <Segmented
            value={view}
            onChange={changeView}
            options={[
              { value: "grid", label: <LayoutGrid className="size-3.5" />, title: "Grid view" },
              { value: "list", label: <List className="size-3.5" />, title: "List view" },
            ]}
          />
          <button onClick={onClose} title="Hide components" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className={view === "grid" ? "grid grid-cols-3 gap-1" : "flex flex-col"}>
          <Tile catalogId="users" name="Users" category="Clients" hint="Traffic source" view={view} onAdd={onAdd} />
          {items.map((i) => (
            <Tile
              key={i.id}
              catalogId={i.id}
              name={i.name}
              category={CATEGORY_LABELS[i.category]}
              hint={`${CATEGORY_LABELS[i.category]}. ${i.blurb}`}
              view={view}
              onAdd={onAdd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
