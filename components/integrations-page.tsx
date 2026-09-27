"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Cloud, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AzureImport } from "@/lib/azure-import";
import { fetchAzureImport, importedSubscriptions, selectWorkspace, storeAzureImport } from "@/lib/workspace";
import { MicrosoftLogo } from "./azure-hud";

type Me = { configured: boolean; user: { name: string; username: string } | null };
type Subscription = { id: string; name: string };

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function StatusBadge({ me }: { me: Me | null }) {
  if (!me) return null;
  if (!me.configured) return <Badge variant="outline" className="border-warn/30 text-warn">Not configured</Badge>;
  if (me.user) return <Badge variant="outline" className="border-ok/30 text-ok">Connected</Badge>;
  return <Badge variant="secondary">Not connected</Badge>;
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
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a cloud account to put real infrastructure on the whiteboard. Access is read-only: nothing is ever changed in your cloud.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="mt-6">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Cloud className="size-5 text-azure" /> Microsoft Azure
            </CardTitle>
            <CardDescription>Import subscriptions from Azure Resource Graph with your own Microsoft account.</CardDescription>
            <CardAction>
              <StatusBadge me={me} />
            </CardAction>
          </CardHeader>

          <CardContent className="space-y-4">
            {!me && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Checking connection…
              </p>
            )}

            {me && !me.configured && (
              <div className="text-sm text-muted-foreground">
                <p>Sign-in isn't configured on this server yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Register the app in Microsoft Entra ID, set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.local, and restart the dev server. The README has
                  the steps.
                </p>
              </div>
            )}

            {me?.configured && !me.user && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Sign in with a work account that has at least the Reader role on a subscription.</p>
                <Button variant="outline" onClick={connect}>
                  <MicrosoftLogo /> Sign in with Microsoft
                </Button>
              </div>
            )}

            {me?.user && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <MicrosoftLogo />
                    <span>
                      <span className="font-medium">{me.user.name}</span> <span className="text-muted-foreground">{me.user.username}</span>
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={disconnect}>
                    <LogOut /> Disconnect
                  </Button>
                </div>

                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscriptions</h2>
                  {!subscriptions && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Finding your subscriptions…
                    </p>
                  )}
                  {subscriptions?.length === 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">This account can't see any subscriptions. It needs at least the Reader role on one.</p>
                  )}
                  {subscriptions && subscriptions.length > 0 && (
                    <ul className="mt-2 divide-y divide-border rounded-lg border border">
                      {subscriptions.map((s) => {
                        const previous = importedById.get(s.id);
                        return (
                          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-mono">{s.id}</span>
                                {previous && ` · imported ${when(previous.importedAt)}`}
                              </div>
                            </div>
                            {previous && (
                              <Button variant="outline" size="sm" onClick={() => openImported(s.id)}>
                                Open
                              </Button>
                            )}
                            <Button size="sm" onClick={() => runImport(s.id)} disabled={busy !== null}>
                              {busy === s.id && <Loader2 className="animate-spin" />}
                              {busy === s.id ? "Importing…" : previous ? "Re-import" : "Import"}
                            </Button>
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
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imported earlier</h2>
                <p className="mt-1 text-xs text-muted-foreground">Saved in this browser. Open them any time; connect to refresh.</p>
                <ul className="mt-2 divide-y divide-border rounded-lg border border">
                  {offline.map((i) => (
                    <li key={i.subscriptionId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{i.subscriptionName}</div>
                        <div className="text-xs text-muted-foreground">imported {when(i.importedAt)}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openImported(i.subscriptionId)}>
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-ok" /> Read-only. The app sees only what your account can see, and your token stays on the server.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-4 border-dashed shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Cloud className="size-5" /> Amazon Web Services
            </CardTitle>
            <CardDescription>Coming later. The plan starts with Azure only.</CardDescription>
            <CardAction>
              <Badge variant="secondary">Soon</Badge>
            </CardAction>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
