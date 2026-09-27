"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenTool, Plug, Target, Trophy, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LEVELS } from "@/lib/levels";
import { loadProgress } from "@/lib/progress";

type Place = { href: string; label: string; Icon: LucideIcon };

// Every place in the app. The sidebar and the breadcrumb both read from this list.
const PLACES: Place[] = [
  { href: "/", label: "Whiteboard", Icon: PenTool },
  { href: "/levels", label: "Levels", Icon: Trophy },
  { href: "/integrations", label: "Integrations", Icon: Plug },
];

type Me = { configured: boolean; user: { name: string; username: string } | null };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function AppSidebar({ current, me, stars }: { current?: Place; me: Me | null; stars: number }) {
  const user = me?.user;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Target className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">System Design Trainer</span>
                  <span className="truncate text-xs text-muted-foreground">Architecture practice</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PLACES.map(({ href, label, Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={current?.href === href} tooltip={label}>
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {href === "/levels" && <SidebarMenuBadge>{`${stars}/${LEVELS.length * 3}`}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={user ? user.username : "Connect Azure"}>
              <Link href="/integrations">
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{user ? initials(user.name) : <Plug className="size-4" />}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user ? user.name : "Azure not connected"}</span>
                  <span className="truncate text-xs text-muted-foreground">{user ? user.username : "Connect in Integrations"}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = PLACES.find((p) => (p.href === "/" ? pathname === "/" : pathname.startsWith(p.href)));
  const [me, setMe] = useState<Me | null>(null);
  const [stars, setStars] = useState(0);

  // Re-read on navigation: signing in and earning stars happen on other pages.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(setMe)
      .catch(() => setMe(null));
    setStars(Object.values(loadProgress().stars).reduce((a, b) => a + b, 0));
  }, [pathname]);

  const connected = !!me?.user;

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh">
        <AppSidebar current={current} me={me} stars={stars} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href="/">System Design Trainer</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {current && (
                  <>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{current.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            {me && (
              <Button variant="outline" size="sm" className="ml-auto" asChild>
                <Link href="/integrations">
                  <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-muted-foreground/40"}`} />
                  {connected ? "Azure connected" : "Connect Azure"}
                </Link>
              </Button>
            )}
          </header>
          <main className="min-h-0 min-w-0 flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
