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

  // La page "Prospects froids" a été supprimée du menu : les prospects froids
  // (>30j sans interaction) sont désormais intégrés au cockpit /relances et
  // visibles via le smart-tag "Froid" sur la fiche prospect.

  const items: Array<{ title: string; url: string; icon: typeof Users; badge: number }> = [
    { title: "Tableau de bord", url: "/tableau", icon: LayoutDashboard, badge: 0 },
    { title: "Inbox", url: "/inbox", icon: Inbox, badge: unreadCount },
    { title: "Prospects", url: "/prospects", icon: Users, badge: 0 },
    { title: "Statut prospect", url: "/pipeline", icon: Kanban, badge: 0 },
    { title: "À faire aujourd'hui", url: "/relances", icon: CalendarClock, badge: dueCount },
    { title: "Génération d'emails", url: "/templates", icon: Sparkles, badge: 0 },
    { title: "Scripts d'appel", url: "/scripts", icon: Headphones, badge: 0 },
    { title: "Chasse aux prospects", url: "/chasse", icon: Target, badge: 0 },
    { title: "Studio", url: "/studio", icon: Rocket, badge: 0 },
  ];
  if (role === "admin") {
    items.push({ title: "Équipe", url: "/equipe", icon: UserCog, badge: 0 });
  }
  // Mon profil placé après Équipe (admin) pour respecter l'ordre :
  // outils opérationnels → admin équipe → préférences perso.
  items.push({ title: "Mon profil", url: "/profil", icon: User, badge: 0 });
  // Le Journal d'activité est désormais intégré au Tableau de bord
  // (onglet "Vue équipe") — plus besoin d'item séparé dans le menu.

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
