import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  UserCog,
  LogOut,
  Kanban,
  User,
  Inbox,
  Sparkles,
  Headphones,
  Target,
  Rocket,
  Receipt,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { role, user, signOut } = useAuth();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  // Badge: relances dues aujourd'hui ou en retard, pour l'utilisateur courant
  const { data: dueCount = 0 } = useQuery({
    queryKey: ["due-followups", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { count } = await supabase
        .from("follow_ups")
        .select("*", { count: "exact", head: true })
        .eq("completed", false)
        .lte("scheduled_at", end.toISOString());
      return count ?? 0;
    },
  });

  // Badge: messages non lus dans l'inbox
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["inbox-unread", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("is_archived", false);
      return count ?? 0;
    },
  });

  // La page "Prospects froids" a été supprimée du menu : les prospects froids
  // (>30j sans interaction) sont désormais intégrés au cockpit /relances et
  // visibles via le smart-tag "Froid" sur la fiche prospect.

  type NavItem = { title: string; url: string; icon: typeof Users; badge: number };

  // ── Trois univers : Prospection · Studio (production) · Facturation ──
  const activeWorkspace: "prospection" | "studio" | "facturation" =
    currentPath.startsWith("/studio") ? "studio"
    : currentPath.startsWith("/facturation") ? "facturation"
    : "prospection";

  const prospectionItems: NavItem[] = [
    { title: "Tableau de bord", url: "/tableau", icon: LayoutDashboard, badge: 0 },
    { title: "Inbox", url: "/inbox", icon: Inbox, badge: unreadCount },
    { title: "Prospects", url: "/prospects", icon: Users, badge: 0 },
    { title: "Statut prospect", url: "/pipeline", icon: Kanban, badge: 0 },
    { title: "À faire aujourd'hui", url: "/relances", icon: CalendarClock, badge: dueCount },
    { title: "Génération d'emails", url: "/templates", icon: Sparkles, badge: 0 },
    { title: "Scripts d'appel", url: "/scripts", icon: Headphones, badge: 0 },
    { title: "Chasse aux prospects", url: "/chasse", icon: Target, badge: 0 },
  ];

  const studioItems: NavItem[] = [
    { title: "Production", url: "/studio", icon: Rocket, badge: 0 },
  ];

  const facturationItems: NavItem[] = [
    { title: "Tableau de bord", url: "/facturation", icon: LayoutDashboard, badge: 0 },
    { title: "Réglages", url: "/facturation/reglages", icon: UserCog, badge: 0 },
  ];

  const mainItems = activeWorkspace === "studio" ? studioItems
    : activeWorkspace === "facturation" ? facturationItems
    : prospectionItems;

  // Items "compte", communs aux deux univers
  const accountItems: NavItem[] = [];
  if (role === "admin") accountItems.push({ title: "Équipe", url: "/equipe", icon: UserCog, badge: 0 });
  accountItems.push({ title: "Mon profil", url: "/profil", icon: User, badge: 0 });

  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton asChild isActive={isActive(item.url)}>
        <Link to={item.url} className="flex items-center gap-2">
          <item.icon className="h-4 w-4" />
          <span className="flex-1">{item.title}</span>
          {item.badge > 0 && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-semibold min-w-[18px] text-center">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="px-2 py-2 space-y-2">
          <BrandLogo size={32} wordmarkClassName="text-sidebar-foreground" />
          <div>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
            {role === "admin" && (
              <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary-foreground font-medium ring-1 ring-primary/40">
                Admin
              </span>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* ── Sélecteur d'univers (liste verticale, noms complets) ── */}
        <div className="px-2 pt-1 pb-2">
          <p className="px-1 pb-1 text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/40">Univers</p>
          <div className="flex flex-col gap-1 rounded-lg bg-sidebar-accent/30 p-1">
            {([
              { ws: "prospection", to: "/tableau", icon: Target, label: "Prospection" },
              { ws: "studio", to: "/studio", icon: Rocket, label: "Studio" },
              { ws: "facturation", to: "/facturation", icon: Receipt, label: "Facturation" },
            ] as const).map((w) => (
              <Link key={w.ws} to={w.to} className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition",
                activeWorkspace === w.ws
                  ? "bg-sidebar text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar/50")}>
                <w.icon className="h-4 w-4 shrink-0" /> {w.label}
              </Link>
            ))}
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{activeWorkspace === "studio" ? "Studio — Production" : activeWorkspace === "facturation" ? "Facturation" : "Prospection"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{mainItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Compte</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{accountItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
          <LogOut className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
