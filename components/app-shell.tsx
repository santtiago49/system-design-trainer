"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, ChevronUp, Cloud, PanelLeft, PenTool, Plug, Plus, Target, Trophy, type LucideIcon } from "lucide-react";
import type { AzureImport } from "@/lib/azure-import";
import { LEVELS } from "@/lib/levels";
import { loadProgress, rankFor, totalXp, type Progress } from "@/lib/progress";
import { importedSubscriptions, loadWorkspace, SANDBOX, selectWorkspace, type Workspace } from "@/lib/workspace";

type Place = { href: string; label: string; Icon: LucideIcon };

// Every place in the app. The sidebar and the breadcrumb both read from this list.
const PLACES: Place[] = [
  { href: "/", label: "Whiteboard", Icon: PenTool },
  { href: "/levels", label: "Levels", Icon: Trophy },
  { href: "/integrations", label: "Integrations", Icon: Plug },
];

type Me = { configured: boolean; user: { name: string; username: string } | null };

const OPEN_KEY = "sdt:sidebar-open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Who is signed in to Azure, or the app itself when nobody is. */
function Account({ me, open }: { me: Me | null; open: boolean }) {
  const user = me?.user;
  return (
    <Link href="/integrations" title={user ? user.username : "Connect Azure"} className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-white">
        {user ? initials(user.name) : <Target className="size-5" />}
      </span>
      {open && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{user ? user.name : "System Design Trainer"}</span>
          <span className="block truncate text-xs text-zinc-500">{user ? user.username : "Azure not connected"}</span>
        </span>
      )}
    </Link>
  );
}

function NavItem({ place, active, open, badge }: { place: Place; active: boolean; open: boolean; badge?: React.ReactNode }) {
  const { href, label, Icon } = place;
  return (
    <Link
      href={href}
      title={open ? undefined : label}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 items-center gap-3 rounded-lg text-sm transition-colors ${open ? "px-3" : "justify-center"} ${
        active ? "bg-zinc-200/70 font-medium text-ink" : "text-zinc-600 hover:bg-zinc-100 hover:text-ink"
      }`}
    >
      <Icon className="size-[18px] shrink-0" />
      {open && <span className="flex-1">{label}</span>}
      {open && badge}
    </Link>
  );
}

/** Workspaces you've been in lately: the current level and imported subscriptions. */
function Recent({ imports, level, onOpen }: { imports: AzureImport[]; level: (typeof LEVELS)[number] | null; onOpen: (w: Workspace) => void }) {
  const [expanded, setExpanded] = useState(true);
  if (!imports.length && !level) return null;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-2 px-3 text-sm text-zinc-600 hover:text-ink">
        <ChevronUp className={`size-4 transition-transform ${expanded ? "" : "rotate-180"}`} /> Recent
      </button>
      {expanded && (
        <ul className="mt-2 space-y-0.5">
          {level && (
            <li>
              <button
                onClick={() => onOpen({ kind: "level", levelId: level.id })}
                className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-zinc-600 hover:bg-zinc-100 hover:text-ink"
              >
                <Trophy className="size-4 shrink-0 text-amber-500" />
                <span className="truncate">{level.title}</span>
              </button>
            </li>
          )}
          {imports.map((i) => (
            <li key={i.subscriptionId}>
              <button
                onClick={() => onOpen({ kind: "azure", subscriptionId: i.subscriptionId })}
                className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-zinc-600 hover:bg-zinc-100 hover:text-ink"
              >
                <Cloud className="size-4 shrink-0 text-azure" />
                <span className="truncate">{i.subscriptionName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RankFooter({ progress, open }: { progress: Progress; open: boolean }) {
  const xp = totalXp(progress);
  const rank = rankFor(xp);
  const pct = rank.next ? ((xp - rank.xp) / (rank.next.xp - rank.xp)) * 100 : 100;
  if (!open) {
    return (
      <Link href="/levels" title={`${rank.title} · ${xp} XP`} className="flex justify-center py-2 text-amber-500">
        <Trophy className="size-5" />
      </Link>
    );
  }
  return (
    <Link href="/levels" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{rank.title}</span>
        <span className="text-xs text-zinc-500">{xp} XP</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = PLACES.find((p) => (p.href === "/" ? pathname === "/" : pathname.startsWith(p.href)));

  const [open, setOpen] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [progress, setProgress] = useState<Progress>({ stars: {} });
  const [imports, setImports] = useState<AzureImport[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => setOpen(readOpen()), []);

  // Re-read on navigation: signing in, importing and earning stars all happen on other pages.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(setMe)
      .catch(() => setMe(null));
    setProgress(loadProgress());
    setImports(importedSubscriptions());
    setWorkspace(loadWorkspace());
  }, [pathname]);

  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, String(!open));
    } catch {}
  };

  const openWorkspace = (w: Workspace) => {
    selectWorkspace(w);
    setWorkspace(w);
    // The whiteboard reads the workspace on mount, so reload it when it's already showing.
    if (pathname === "/") window.location.reload();
    else router.push("/");
  };

  const stars = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const level = workspace?.kind === "level" ? (LEVELS.find((l) => l.id === workspace.levelId) ?? null) : null;
  const connected = !!me?.user;

  const badges: Record<string, React.ReactNode> = {
    "/levels": <span className="rounded-md bg-white px-1.5 text-xs text-zinc-500 ring-1 ring-line">{`${stars}/${LEVELS.length * 3}`}</span>,
    "/integrations": <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-zinc-300"}`} title={connected ? "Azure connected" : "Azure not connected"} />,
  };

  return (
    <div className="flex h-screen bg-white">
      <aside className={`flex shrink-0 flex-col border-r border-line bg-zinc-50 transition-[width] ${open ? "w-64" : "w-[68px]"}`}>
        <div className={`flex h-16 items-center border-b border-line ${open ? "justify-between px-4" : "justify-center"}`}>
          {open && <Account me={me} open />}
          <button onClick={toggle} title={open ? "Collapse sidebar" : "Expand sidebar"} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-ink">
            <PanelLeft className="size-[18px]" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          <button
            onClick={() => openWorkspace(SANDBOX)}
            title="Free play"
            className={`mb-4 flex h-10 items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-white hover:bg-zinc-800 ${open ? "" : "px-0"}`}
          >
            <Plus className="size-4" />
            {open && "Free play"}
          </button>

          <nav aria-label="Main" className="space-y-0.5">
            {PLACES.map((place) => (
              <NavItem key={place.href} place={place} active={current?.href === place.href} open={open} badge={badges[place.href]} />
            ))}
          </nav>

          {open && <Recent imports={imports} level={level} onOpen={openWorkspace} />}
        </div>

        <div className="border-t border-line p-3">
          {!open && (
            <div className="mb-1 flex justify-center">
              <Account me={me} open={false} />
            </div>
          )}
          <RankFooter progress={progress} open={open} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-white px-6">
          <Link href="/" className="text-sm text-zinc-500 hover:text-ink">
            System Design Trainer
          </Link>
          {current && (
            <>
              <ChevronRight className="size-4 text-zinc-400" />
              <span className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-sm font-medium">
                <current.Icon className="size-4" /> {current.label}
              </span>
            </>
          )}
          <Link
            href="/integrations"
            title={connected ? `Azure connected as ${me!.user!.username}` : "Connect Azure"}
            className="ml-auto flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-ink"
          >
            <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-zinc-300"}`} />
            {connected ? "Azure connected" : "Connect Azure"}
          </Link>
        </header>
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
