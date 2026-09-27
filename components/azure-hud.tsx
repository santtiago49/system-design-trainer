"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Cloud, Loader2, Map as MapIcon, RefreshCw, X } from "lucide-react";
import type { AzureImport } from "@/lib/azure-import";

type Subscription = { id: string; name: string };

type Me = { configured: boolean; user: { name: string; username: string } | null };

/** Signs in with Microsoft, picks a subscription and runs the import on the user's behalf. */
export function AzureImportDialog({
  onImported,
  onClose,
  initialError = null,
}: {
  onImported: (result: AzureImport) => void;
  onClose: () => void;
  initialError?: string | null;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: Me) => {
        setMe(data);
        if (!data.user) return;
        return fetch("/api/azure/subscriptions").then(async (res) => {
          const subs = await res.json();
          if (!res.ok) throw new Error(subs.error);
          setSubscriptions(subs);
          setSelected(subs[0]?.id ?? "");
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const signIn = () => {
    // Come back to the canvas with this dialog open.
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent("/?import=azure")}`;
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe((current) => (current ? { ...current, user: null } : current));
    setSubscriptions(null);
  };

  const run = async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/azure/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onImported(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setImporting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/20 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Cloud className="size-5 text-azure" /> Import from Azure
          </h2>
          <button onClick={onClose} title="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Reads one subscription with your own Microsoft work account, seeing only what you can already see. Read-only: nothing changes in Azure.
        </p>

        {!me && !error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" /> Checking sign-in…
          </p>
        )}

        {me && !me.configured && (
          <p className="mt-4 rounded-lg bg-warn/10 p-2 text-sm text-warn">
            Sign-in isn't configured yet. Register the app in Microsoft Entra ID and set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.local.
          </p>
        )}

        {me?.configured && !me.user && (
          <button
            onClick={signIn}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2 text-sm font-medium hover:bg-zinc-50"
          >
            <MicrosoftLogo /> Sign in with Microsoft
          </button>
        )}

        {me?.user && (
          <>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs">
              <span className="truncate">
                Signed in as <span className="font-medium">{me.user.username}</span>
              </span>
              <button onClick={signOut} className="ml-2 shrink-0 text-zinc-500 hover:text-ink">
                Sign out
              </button>
            </div>
            {!subscriptions && !error && (
              <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="size-4 animate-spin" /> Finding your subscriptions…
              </p>
            )}
            {subscriptions?.length === 0 && (
              <p className="mt-3 text-sm text-zinc-600">This account can't see any subscriptions. It needs at least the Reader role on one.</p>
            )}
            {subscriptions && subscriptions.length > 0 && (
              <label className="mt-3 block text-xs font-medium text-zinc-600">
                Subscription
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm font-normal text-ink"
                >
                  {subscriptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {error && <p className="mt-3 rounded-lg bg-over/10 p-2 text-sm text-over">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-zinc-50">
            Cancel
          </button>
          {me?.user && (
            <button
              onClick={run}
              disabled={!selected || importing}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {importing && <Loader2 className="size-4 animate-spin" />} {importing ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Microsoft's four-square mark, as its sign-in button guidelines use. */
function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Summary of an imported subscription: what was mapped, and what wasn't. */
export function AzureHud({ result, onReimport, onOpenLevels }: { result: AzureImport; onReimport: () => void; onOpenLevels: () => void }) {
  const [open, setOpen] = useState(true);
  const unmappedCount = result.unmapped.reduce((n, u) => n + u.count, 0);

  return (
    <div className="w-80 rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Cloud className="size-4 text-azure" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-zinc-400">Imported from Azure</div>
          <div className="truncate text-sm font-semibold">{result.subscriptionName}</div>
        </div>
        <button onClick={() => setOpen(!open)} title={open ? "Collapse" : "Expand"} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {open && (
        <div className="space-y-3 px-3 pb-3 pt-2 text-xs">
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Resources in subscription" value={result.totalResources} />
            <Stat label="On the canvas" value={result.resources.length + (result.monitoring ? 1 : 0)} />
            <Stat label="Connections inferred" value={result.edges.length} />
            <Stat label="Supporting (not drawn)" value={result.supporting} />
          </div>
          <p className="text-zinc-500">
            Connections come only from Front Door origins and Application Gateway backends. Draw the rest, and connect Users to your entry points.
          </p>

          {unmappedCount > 0 && (
            <div>
              <div className="mb-1 font-semibold text-zinc-600">Not modeled yet ({unmappedCount})</div>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {result.unmapped.map((u) => (
                  <li key={u.type} className="flex justify-between gap-2 text-zinc-500">
                    <span className="truncate font-mono text-[11px]">{u.type.replace("microsoft.", "")}</span>
                    <span>{u.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3 border-t border-line pt-2 text-zinc-600">
            <button onClick={onReimport} className="flex items-center gap-1 whitespace-nowrap hover:text-ink">
              <RefreshCw className="size-3.5" /> Re-import
            </button>
            <button onClick={onOpenLevels} className="flex items-center gap-1 whitespace-nowrap hover:text-ink">
              <MapIcon className="size-3.5" /> Levels
            </button>
            <span className="ml-auto whitespace-nowrap text-[11px] text-zinc-400">
              {new Date(result.importedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 px-2 py-1.5">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
