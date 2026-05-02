import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  PlayCircle,
  XCircle,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { RunStatusBadge } from "@/components/run-status-badge";
import { timeAgo } from "@/lib/utils";

export function DashboardPage() {
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: api.listRuns,
    refetchInterval: 5_000,
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: api.models,
  });

  const runs = runsQuery.data?.runs ?? [];
  const totals = {
    total: runs.length,
    running: runs.filter((r) => r.status === "running" || r.status === "queued").length,
    completed: runs.filter((r) => r.status === "completed").length,
    failed: runs.filter((r) => r.status === "failed").length,
  };

  const providerKeys = modelsQuery.data?.provider_keys_set ?? {};
  const configuredProviders = Object.entries(providerKeys)
    .filter(([, set]) => set)
    .map(([name]) => name);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Drive multi-agent stock analysis and review past runs."
        actions={
          <Button asChild>
            <Link to="/runs/new">
              <PlayCircle className="h-4 w-4" />
              New Run
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Activity}
          label="Runs total"
          value={totals.total}
          tone="default"
        />
        <StatCard
          icon={Clock}
          label="In flight"
          value={totals.running}
          tone="warning"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={totals.completed}
          tone="success"
        />
        <StatCard
          icon={XCircle}
          label="Failed"
          value={totals.failed}
          tone="destructive"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent runs</CardTitle>
              <CardDescription>The latest five analyses.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/runs">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-border">
                {runs.slice(0, 5).map((run) => (
                  <li key={run.id}>
                    <Link
                      to={`/runs/${run.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-accent/40 -mx-3 px-3 rounded-md"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm font-semibold w-16 truncate">
                          {run.ticker}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {run.trade_date}
                        </span>
                        <span className="text-xs text-muted-foreground hidden md:inline">
                          {run.analysts.join(", ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(run.created_at)}
                        </span>
                        <RunStatusBadge status={run.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Providers</CardTitle>
            <CardDescription>
              API keys detected from environment variables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(providerKeys).map(([name, set]) => (
              <div
                key={name}
                className="flex items-center justify-between text-sm"
              >
                <span className="capitalize">{name}</span>
                <span
                  className={
                    set
                      ? "text-success font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {set ? "configured" : "missing"}
                </span>
              </div>
            ))}
            {configuredProviders.length === 0 && (
              <p className="text-xs text-muted-foreground pt-2">
                Set provider API keys in your <code>.env</code> before running.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "default" | "warning" | "success" | "destructive";
}) {
  const toneClass: Record<typeof tone, string> = {
    default: "text-foreground",
    warning: "text-warning",
    success: "text-success",
    destructive: "text-destructive",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Icon className={`h-4 w-4 ${toneClass[tone]}`} />
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <PlayCircle className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground mb-3">
        No runs yet. Kick off your first analysis.
      </p>
      <Button asChild>
        <Link to="/runs/new">Start a run</Link>
      </Button>
    </div>
  );
}
