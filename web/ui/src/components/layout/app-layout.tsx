import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  PlayCircle,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/agents", label: "Agents", icon: Users },
  { to: "/runs", label: "Runs", icon: Activity },
  { to: "/runs/new", label: "New Run", icon: PlayCircle },
  { to: "/config", label: "Config", icon: Settings },
];

export function AppLayout() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    retry: false,
  });

  const apiOnline = !!health?.ok;

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card/40">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">TradingAgents</div>
            <div className="text-[11px] text-muted-foreground">
              Multi-agent console
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "hover:bg-accent/50 hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>API</span>
            <Badge variant={apiOnline ? "success" : "destructive"}>
              {apiOnline ? "Online" : "Offline"}
            </Badge>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="md:hidden flex h-14 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">TradingAgents</span>
          <Badge variant={apiOnline ? "success" : "destructive"}>
            {apiOnline ? "API Online" : "API Offline"}
          </Badge>
        </header>
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
