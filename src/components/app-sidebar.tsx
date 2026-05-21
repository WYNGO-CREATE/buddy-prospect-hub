import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  UserCog,
  LogOut,
  Mail,
  Kanban,
  Snowflake,
  Activity,
  User,
  Inbox,
  Sparkles,
  Workflow,
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

  // Badge: prospects froids (>30j sans contact, hors converti/perdu)
  const { data: coldCount = 0 } = useQuery({
    queryKey: ["cold-count", user?.id],
    enabled: !!user,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data: lc } = await supabase.rpc("prospects_last_contact");
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const coldIds = new Set(
        ((lc || []) as Array<{ prospect_id: string; last_contact_at: string }>)
          .filter((r) => new Date(r.last_contact_at).getTime() < cutoff)
          .map((r) => r.prospect_id),
      );
      if (coldIds.size === 0) return 0;
      const { data } = await supabase
        .from("prospects")
        .select("id, status")
        .in("id", Array.from(coldIds))
        .not("status", "in", "(converti,perdu)");
      return (data || []).length;
    },
  });

  const items: Array<{ title: string; url: string; icon: typeof Users; badge: number }> = [
    { title: "Tableau de bord", url: "/tableau", icon: LayoutDashboard, badge: 0 },
    { title: "Inbox", url: "/inbox", icon: Inbox, badge: unreadCount },
    { title: "Prospects", url: "/prospects", icon: Users, badge: 0 },
    { title: "Pipeline", url: "/pipeline", icon: Kanban, badge: 0 },
    { title: "Relances", url: "/relances", icon: CalendarClock, badge: dueCount },
    { title: "Prospects froids", url: "/froids", icon: Snowflake, badge: coldCount },
    { title: "Templates", url: "/templates", icon: Sparkles, badge: 0 },
    { title: "Workflows", url: "/workflows", icon: Workflow, badge: 0 },
    { title: "Modèles d'e-mails", url: "/mails", icon: Mail, badge: 0 },
    { title: "Mon profil", url: "/profil", icon: User, badge: 0 },
  ];
  if (role === "admin") {
    items.push({ title: "Équipe", url: "/equipe", icon: UserCog, badge: 0 });
    items.push({ title: "Journal d'activité", url: "/logs", icon: Activity, badge: 0 });
  }

  return (
    <Sidebar collapsible="icon">
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
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
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
              ))}
            </SidebarMenu>
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
