import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { RunStatusBadge } from "@/components/run-status-badge";
import { formatDate, timeAgo } from "@/lib/utils";

export function RunsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: api.listRuns,
    refetchInterval: 4_000,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["runs"] }),
  });

  const runs = data?.runs ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        description="Every analysis the API has executed, oldest first to most recent."
        actions={
          <Button asChild>
            <Link to="/runs/new">
              <PlayCircle className="h-4 w-4" />
              New Run
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Click a row to see the live timeline and final reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading runs…</p>
          )}
          {!isLoading && runs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No runs yet — start one from the New Run page.
            </p>
          )}
          {runs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Ticker</th>
                    <th className="py-2 pr-3 font-medium">Trade date</th>
                    <th className="py-2 pr-3 font-medium">Analysts</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Created</th>
                    <th className="py-2 pr-3 font-medium">Signal</th>
                    <th className="py-2 font-medium" aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-border/60 hover:bg-accent/30"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          to={`/runs/${run.id}`}
                          className="font-mono font-semibold underline-offset-2 hover:underline"
                        >
                          {run.ticker}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {run.trade_date}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {run.analysts.join(", ")}
                      </td>
                      <td className="py-2 pr-3">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td
                        className="py-2 pr-3 text-muted-foreground"
                        title={formatDate(run.created_at)}
                      >
                        {timeAgo(run.created_at)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {run.signal ?? "—"}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={
                            deleteMutation.isPending ||
                            run.status === "running" ||
                            run.status === "queued"
                          }
                          onClick={() => deleteMutation.mutate(run.id)}
                          aria-label={`Delete run ${run.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
