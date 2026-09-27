"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, PanelLeftClose, Search, X } from "lucide-react";
import { CATALOG, CATEGORY_LABELS, type CatalogItem, type Category, type Provider } from "@/lib/catalog";
import { ServiceIcon } from "./icons";

export const DRAG_TYPE = "application/x-sd-component";

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as Category[];
const VIEW_KEY = "sdt:palette-view";

type View = "grid" | "list";
type Entry = { id: string; name: string; category: Category; hint: string };

const USERS: Entry = { id: "users", name: "Users", category: "client", hint: "Traffic source" };

const PROVIDERS: { id: Exclude<Provider, "generic">; label: string; accent: string }[] = [
  { id: "aws", label: "AWS", accent: "border-aws text-ink" },
  { id: "azure", label: "Azure", accent: "border-azure text-ink" },
];

function toEntry(item: CatalogItem): Entry {
  return { id: item.id, name: item.name, category: item.category, hint: `${CATEGORY_LABELS[item.category]}. ${item.blurb}` };
}

function dragProps(entry: Entry, onAdd: (id: string) => void) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, entry.id);
      event.dataTransfer.effectAllowed = "move";
    },
    onClick: () => onAdd(entry.id),
    title: `${entry.name}: ${entry.hint}`,
  };
}

function ListRow({ entry, onAdd }: { entry: Entry; onAdd: (id: string) => void }) {
  return (
    <button
      {...dragProps(entry, onAdd)}
      className="flex w-full cursor-grab items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 active:cursor-grabbing"
    >
      <ServiceIcon catalogId={entry.id} category={null} size={24} />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function GridTile({ entry, onAdd }: { entry: Entry; onAdd: (id: string) => void }) {
  return (
    <button
      {...dragProps(entry, onAdd)}
      className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 text-center hover:bg-zinc-100 active:cursor-grabbing"
    >
      <ServiceIcon catalogId={entry.id} category={null} size={32} />
      <span className="line-clamp-2 text-[11px] leading-tight text-zinc-700">{entry.name}</span>
    </button>
  );
}

function ViewButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md p-1 ${active ? "text-ink" : "text-zinc-400 hover:text-zinc-600"}`}
    >
      {children}
    </button>
  );
}

export function Palette({ onAdd, onClose, initialProvider = "aws" }: {
  onAdd: (catalogId: string) => void;
  onClose: () => void;
  initialProvider?: Exclude<Provider, "generic">;
}) {
  const [provider, setProvider] = useState<Exclude<Provider, "generic">>(initialProvider);
  const [view, setView] = useState<View>("grid");
  const [query, setQuery] = useState("");

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

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [
      USERS,
      ...CATALOG.filter((c) => c.provider === provider)
        .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
        .map(toEntry),
    ];
    if (!q) return all;
    return all.filter((e) => e.name.toLowerCase().includes(q) || CATEGORY_LABELS[e.category].toLowerCase().includes(q));
  }, [provider, query]);

  const groups = useMemo(() => {
    const byCategory = new Map<Category, Entry[]>();
    for (const entry of entries) byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
    return [...byCategory];
  }, [entries]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Components</h2>
          <button onClick={onClose} title="Hide components" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-ink">
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-line bg-zinc-50 px-2.5 py-1.5 focus-within:border-zinc-400 focus-within:bg-white">
          <Search className="size-4 shrink-0 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          {query && (
            <button onClick={() => setQuery("")} title="Clear search" className="text-zinc-400 hover:text-ink">
              <X className="size-3.5" />
            </button>
          )}
        </label>

        <div className="flex items-end justify-between border-b border-line">
          <div className="flex gap-4">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                  provider === p.id ? p.accent : "border-transparent text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex pb-1.5">
            <ViewButton active={view === "grid"} title="Grid view" onClick={() => changeView("grid")}>
              <LayoutGrid className="size-4" />
            </ViewButton>
            <ViewButton active={view === "list"} title="List view" onClick={() => changeView("list")}>
              <List className="size-4" />
            </ViewButton>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-2">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-400">No services match “{query}”.</p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-3 gap-1">
            {entries.map((e) => (
              <GridTile key={e.id} entry={e} onAdd={onAdd} />
            ))}
          </div>
        ) : (
          groups.map(([category, group]) => (
            <section key={category}>
              <h3 className="sticky top-0 z-10 bg-white/95 px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400 backdrop-blur">
                {CATEGORY_LABELS[category]}
              </h3>
              {group.map((e) => (
                <ListRow key={e.id} entry={e} onAdd={onAdd} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
