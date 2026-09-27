"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cloud, Loader2, LogOut, ShieldCheck } from "lucide-react";
import type { AzureImport } from "@/lib/azure-import";
import { fetchAzureImport, importedSubscriptions, selectWorkspace, storeAzureImport } from "@/lib/workspace";
import { MicrosoftLogo } from "./azure-hud";

type Me = { configured: boolean; user: { name: string; username: string } | null };
type Subscription = { id: string; name: string };

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function StatusBadge({ me }: { me: Me | null }) {
  if (!me) return null;
  const [label, className] = !me.configured
    ? ["Not configured", "bg-warn/10 text-warn"]
    : me.user
      ? ["Connected", "bg-ok/10 text-ok"]
      : ["Not connected", "bg-zinc-100 text-zinc-600"];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

export function IntegrationsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [imported, setImported] = useState<AzureImport[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("signin_error"));

  const load = useCallback(async () => {
    setImported(importedSubscriptions());
    const status: Me = await fetch("/api/auth/me").then((res) => res.json());
    setMe(status);
    if (!status.user) return setSubscriptions(null);
    const res = await fetch("/api/azure/subscriptions");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setSubscriptions(data);
  }, []);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // Drop ?signin_error= from the address bar once it's shown.
    if (params.has("signin_error")) router.replace("/integrations");
  }, [load, params, router]);

  const connect = () => {
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent("/integrations")}`;
  };

  const disconnect = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await load();
  };

  const runImport = async (subscriptionId: string) => {
    setBusy(subscriptionId);
    setError(null);
    try {
      storeAzureImport(await fetchAzureImport(subscriptionId));
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setBusy(null);
    }
  };

  const openImported = (subscriptionId: string) => {
    selectWorkspace({ kind: "azure", subscriptionId });
    router.push("/");
  };

  const importedById = new Map(imported.map((i) => [i.subscriptionId, i]));
  // Subscriptions imported before but not visible right now (signed out, or no longer accessible).
  const offline = imported.filter((i) => !subscriptions?.some((s) => s.id === i.subscriptionId));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Connect a cloud account to put real infrastructure on the whiteboard. Access is read-only: nothing is ever changed in your cloud.
        </p>

        {error && <p className="mt-4 rounded-lg bg-over/10 p-3 text-sm text-over">{error}</p>}

        <section className="mt-6 rounded-xl border border-line bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <div className="rounded-lg bg-azure/10 p-2">
              <Cloud className="size-5 text-azure" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Microsoft Azure</div>
              <div className="text-xs text-zinc-500">Import subscriptions from Azure Resource Graph with your own Microsoft account.</div>
            </div>
            <StatusBadge me={me} />
          </div>

          <div className="space-y-4 p-4">
            {!me && (
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="size-4 animate-spin" /> Checking connection…
              </p>
            )}

            {me && !me.configured && (
              <div className="text-sm text-zinc-600">
                <p>Sign-in isn't configured on this server yet.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Register the app in Microsoft Entra ID, set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.local, and restart the dev server. The README has
                  the steps.
                </p>
              </div>
            )}

            {me?.configured && !me.user && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-600">Sign in with a work account that has at least the Reader role on a subscription.</p>
                <button onClick={connect} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-zinc-50">
                  <MicrosoftLogo /> Sign in with Microsoft
                </button>
              </div>
            )}

            {me?.user && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <MicrosoftLogo />
                    <span>
                      <span className="font-medium">{me.user.name}</span> <span className="text-zinc-500">{me.user.username}</span>
                    </span>
                  </span>
                  <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-ink">
                    <LogOut className="size-3.5" /> Disconnect
                  </button>
                </div>

                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Subscriptions</h2>
                  {!subscriptions && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
                      <Loader2 className="size-4 animate-spin" /> Finding your subscriptions…
                    </p>
                  )}
                  {subscriptions?.length === 0 && (
                    <p className="mt-2 text-sm text-zinc-600">This account can't see any subscriptions. It needs at least the Reader role on one.</p>
                  )}
                  {subscriptions && subscriptions.length > 0 && (
                    <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                      {subscriptions.map((s) => {
                        const previous = importedById.get(s.id);
                        return (
                          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{s.name}</div>
                              <div className="text-xs text-zinc-500">
                                <span className="font-mono">{s.id}</span>
                                {previous && ` · imported ${when(previous.importedAt)}`}
                              </div>
                            </div>
                            {previous && (
                              <button onClick={() => openImported(s.id)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-zinc-50">
                                Open
                              </button>
                            )}
                            <button
                              onClick={() => runImport(s.id)}
                              disabled={busy !== null}
                              className="flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {busy === s.id && <Loader2 className="size-3.5 animate-spin" />}
                              {busy === s.id ? "Importing…" : previous ? "Re-import" : "Import"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}

            {offline.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Imported earlier</h2>
                <p className="mt-1 text-xs text-zinc-500">Saved in this browser. Open them any time; connect to refresh.</p>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {offline.map((i) => (
                    <li key={i.subscriptionId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{i.subscriptionName}</div>
                        <div className="text-xs text-zinc-500">imported {when(i.importedAt)}</div>
                      </div>
                      <button onClick={() => openImported(i.subscriptionId)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-zinc-50">
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <ShieldCheck className="size-3.5 text-ok" /> Read-only. The app sees only what your account can see, and your token stays on the server.
            </p>
          </div>
        </section>

        <section className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-zinc-500">
          <Cloud className="size-5" />
          <div>
            <div className="font-medium text-zinc-600">Amazon Web Services</div>
            <div className="text-xs">Coming later. The plan starts with Azure only.</div>
          </div>
        </section>
      </div>
    </div>
  );
}
