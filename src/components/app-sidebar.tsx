import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, CalendarClock, UserCog, LogOut } from "lucide-react";
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

export function AppSidebar() {
  const { role, user, signOut } = useAuth();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  const items = [
    { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
    { title: "Prospects", url: "/prospects", icon: Users },
    { title: "Relances", url: "/relances", icon: CalendarClock },
  ];
  if (role === "admin") {
    items.push({ title: "Équipe", url: "/equipe", icon: UserCog });
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
                      <span>{item.title}</span>
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
