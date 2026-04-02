import { Activity, CalendarDays, CalendarRange, Gauge, Layers3, Link, RefreshCcw, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/lovable/client";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { DashboardView, StravaConnection } from "@/lib/training-analytics";

type TrainingAppSidebarProps = {
  view: DashboardView;
  activitiesCount: number;
  cyclesCount: number;
  connection: StravaConnection | null;
};

const navigation = [
  { title: "Entrenamiento", url: "/training", icon: Activity, key: "training" as const },
  { title: "Semana", url: "/week", icon: CalendarDays, key: "week" as const },
  { title: "Mes", url: "/month", icon: CalendarRange, key: "month" as const },
  { title: "Año", url: "/year", icon: Gauge, key: "year" as const },
  { title: "Ciclos", url: "/cycles", icon: Layers3, key: "cycles" as const },
];

function StravaFooterBlock({ connection, collapsed }: { connection: StravaConnection | null; collapsed: boolean }) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Inicia sesión primero.");
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/strava-auth?action=authorize`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) throw new Error("Error al generar enlace de Strava");
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error conectando con Strava");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.functions.invoke("strava-sync", {
        body: { user_id: session.user.id },
      });

      if (error) throw error;
      toast.success("Sincronización iniciada. Las actividades aparecerán en unos momentos.");
    } catch (err) {
      toast.error("Error al sincronizar");
    } finally {
      setLoading(false);
    }
  };

  const isActive = connection?.status === "active";

  return (
    <div className="rounded-[calc(var(--radius)-0.25rem)] border border-sidebar-border bg-sidebar-accent p-3 text-sm text-sidebar-foreground">
      <div className="mb-2 flex items-center gap-2">
        {isActive ? (
          <Activity className="h-4 w-4 text-green-500" />
        ) : (
          <Link className="h-4 w-4 text-sidebar-primary" />
        )}
        {!collapsed && <span className="font-medium">{isActive ? "Strava conectado" : "Strava"}</span>}
      </div>
      {!collapsed && (
        <>
          <p className="text-xs leading-relaxed text-sidebar-foreground/70 mb-2">
            {isActive
              ? `Conectado${connection.last_synced_at ? ` · Sync ${new Date(connection.last_synced_at).toLocaleDateString("es-ES")}` : ""}`
              : "Conecta tu cuenta para importar actividades."}
          </p>
          {isActive ? (
            <Button variant="soft" size="sm" className="w-full" onClick={handleSync} disabled={loading}>
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
          ) : (
            <Button variant="hero" size="sm" className="w-full" onClick={handleConnect} disabled={loading}>
              <Link className="h-3.5 w-3.5" />
              Conectar Strava
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function TrainingAppSidebar({ view, activitiesCount, cyclesCount, connection }: TrainingAppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader className="gap-4 p-4">
        <div className="flex items-center gap-3 rounded-[calc(var(--radius)-0.2rem)] bg-sidebar-accent p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Gauge className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div>
              <p className="font-display text-lg text-sidebar-foreground">Endurance Lab</p>
              <p className="text-xs text-sidebar-foreground/70">Strava + IA + analítica temporal</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-4">
        <SidebarGroup>
          <SidebarGroupLabel>Explorar</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const badgeValue = item.key === "training" ? activitiesCount : item.key === "cycles" ? cyclesCount : undefined;

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={view === item.key} tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-primary text-sidebar-primary-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && badgeValue !== undefined && (
                          <Badge variant="secondary" className="ml-auto bg-sidebar-background/60 text-sidebar-foreground">
                            {badgeValue}
                          </Badge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        <StravaFooterBlock connection={connection} collapsed={collapsed} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}