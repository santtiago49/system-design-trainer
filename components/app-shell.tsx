"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenTool, Plug, Target, Trophy, type LucideIcon } from "lucide-react";

type Place = { href: string; label: string; Icon: LucideIcon };

// Every place in the app. The rail and the header both read from this list.
const PLACES: Place[] = [
  { href: "/", label: "Whiteboard", Icon: PenTool },
  { href: "/levels", label: "Levels", Icon: Trophy },
  { href: "/integrations", label: "Integrations", Icon: Plug },
];

type Me = { configured: boolean; user: { name: string; username: string } | null };

/** Azure connection status in the header; links to Integrations. */
function AzureStatus() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  // Re-check on navigation: connecting or disconnecting happens on another page.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, [pathname]);

  if (!me) return null;
  const connected = !!me.user;
  return (
    <Link
      href="/integrations"
      title={connected ? `Azure connected as ${me.user!.username}` : "Connect Azure"}
      className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-ink"
    >
      <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-zinc-300"}`} />
      {connected ? (
        <span>
          Azure · <span className="font-medium text-ink">{me.user!.name}</span>
        </span>
      ) : (
        "Azure not connected"
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = PLACES.find((p) => (p.href === "/" ? pathname === "/" : pathname.startsWith(p.href)));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-white px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Target className="size-5" /> System Design Trainer
        </Link>
        {current && (
          <>
            <span className="text-zinc-300">/</span>
            <span className="text-sm text-zinc-600">{current.label}</span>
          </>
        )}
        <div className="ml-auto">
          <AzureStatus />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-white py-3">
          {PLACES.map(({ href, label, Icon }) => {
            const active = current?.href === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[10.5px] font-medium transition-colors ${
                  active ? "bg-ink text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-ink"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
