import { useEffect, useMemo, useReducer, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleStop, RefreshCw } from "lucide-react";

import { api, streamRunEvents } from "@/lib/api";
import type { Run, RunEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { RunStatusBadge } from "@/components/run-status-badge";
import { Markdown } from "@/components/markdown";
import { formatDate } from "@/lib/utils";

type State = {
  agent_status: Record<string, string>;
  reports: Record<string, string | null>;
  messages: { ts: string; role: string; content: string }[];
  toolCalls: { ts: string; name: string; args: unknown }[];
  decision?: string | null;
  signal?: string | null;
  error?: string | null;
};

type Action =
  | { type: "init"; run: Run }
  | { type: "event"; event: RunEvent };

function reducer(state: State, action: Action): State {
  if (action.type === "init") {
    return {
      agent_status: { ...action.run.agent_status },
      reports: { ...action.run.reports },
      messages: [],
      toolCalls: [],
      decision: action.run.decision,
      signal: action.run.signal,
      error: action.run.error,
    };
  }
  const evt = action.event;
  if (evt.type === "agent_status") {
    return {
      ...state,
      agent_status: (evt.agent_status as Record<string, string>) ?? state.agent_status,
    };
  }
  if (evt.type === "report") {
    return {
      ...state,
      reports: {
        ...state.reports,
        [evt.section as string]: (evt.content as string) ?? null,
      },
    };
  }
  if (evt.type === "init") {
    return {
      ...state,
      agent_status:
        (evt.agent_status as Record<string, string>) ?? state.agent_status,
      reports: (evt.reports as Record<string, string | null>) ?? state.reports,
    };
  }
  if (evt.type === "message") {
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          ts: evt.ts,
          role: (evt.role as string) ?? "Agent",
          content: (evt.content as string) ?? "",
        },
      ].slice(-200),
    };
  }
  if (evt.type === "tool_call") {
    return {
      ...state,
      toolCalls: [
        ...state.toolCalls,
        {
          ts: evt.ts,
          name: (evt.name as string) ?? "tool",
          args: evt.args,
        },
      ].slice(-200),
    };
  }
  if (evt.type === "status") {
    return {
      ...state,
      decision: (evt.decision as string | undefined) ?? state.decision,
      signal: (evt.signal as string | undefined) ?? state.signal,
      error: (evt.error as string | undefined) ?? state.error,
    };
  }
  return state;
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId!),
    enabled: !!runId,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "running" || status === "queued" ? 5_000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: api.cancelRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", runId] }),
  });

  const [state, dispatch] = useReducer(reducer, {
    agent_status: {},
    reports: {},
    messages: [],
    toolCalls: [],
  });
  const initialized = useRef(false);

  useEffect(() => {
    if (!runQuery.data || initialized.current) return;
    dispatch({ type: "init", run: runQuery.data });
    initialized.current = true;
  }, [runQuery.data]);

  const status = runQuery.data?.status;

  useEffect(() => {
    if (!runId || !runQuery.data) return;
    if (status !== "running" && status !== "queued") return;
    const source = streamRunEvents(
      runId,
      (event) => dispatch({ type: "event", event }),
      () => queryClient.invalidateQueries({ queryKey: ["run", runId] }),
    );
    return () => source.close();
  }, [runId, runQuery.data, status, queryClient]);

  const run = runQuery.data;
  const orderedAgents = useMemo(
    () => Object.entries(state.agent_status),
    [state.agent_status],
  );
  const reportEntries = useMemo(
    () =>
      Object.entries(state.reports).filter(([, content]) => content && content.trim()),
    [state.reports],
  );

  if (!run) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/runs")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Loading run…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${run.ticker} · ${run.trade_date}`}
        description={`Run ${run.id}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/runs")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {(status === "running" || status === "queued") && (
              <Button
                variant="destructive"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(run.id)}
              >
                <CircleStop className="h-4 w-4" /> Cancel
              </Button>
            )}
            {status === "completed" || status === "failed" || status === "cancelled" ? (
              <Button
                variant="outline"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["run", run.id] })
                }
              >
                <RefreshCw className="h-4 w-4" /> Reload
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryStat label="Status" value={<RunStatusBadge status={run.status} />} />
        <SummaryStat label="Signal" value={state.signal ?? run.signal ?? "—"} mono />
        <SummaryStat
          label="Started"
          value={formatDate(run.started_at) || "—"}
        />
        <SummaryStat
          label="Finished"
          value={formatDate(run.finished_at) || "—"}
        />
      </div>

      {run.error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Run failed</CardTitle>
            <CardDescription>{run.error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Live progress per agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {orderedAgents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Agents will appear here once the run starts.
              </p>
            )}
            {orderedAgents.map(([agent, agentStatus]) => (
              <div
                key={agent}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <span className="truncate pr-2">{agent}</span>
                <AgentStatusBadge status={agentStatus} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Section content streams in as each agent finalizes its output.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              defaultValue={reportEntries[0]?.[0] ?? "messages"}
              key={reportEntries.map(([k]) => k).join("|") || "empty"}
            >
              <TabsList className="flex flex-wrap h-auto">
                {reportEntries.map(([section]) => (
                  <TabsTrigger key={section} value={section}>
                    {SECTION_TITLES[section] ?? section}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="messages">Activity</TabsTrigger>
                <TabsTrigger value="tools">Tool calls</TabsTrigger>
              </TabsList>
              {reportEntries.map(([section, content]) => (
                <TabsContent key={section} value={section}>
                  <div className="rounded-md border p-4 max-h-[480px] overflow-y-auto">
                    <Markdown source={content ?? ""} />
                  </div>
                </TabsContent>
              ))}
              <TabsContent value="messages">
                <div className="rounded-md border max-h-[480px] overflow-y-auto divide-y divide-border text-sm">
                  {state.messages.length === 0 && (
                    <p className="p-4 text-muted-foreground text-sm">
                      No agent messages yet.
                    </p>
                  )}
                  {state.messages
                    .slice()
                    .reverse()
                    .map((m, i) => (
                      <div key={i} className="p-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{m.role}</Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(m.ts).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground whitespace-pre-wrap break-words">
                          {m.content.slice(0, 1200)}
                          {m.content.length > 1200 ? "…" : ""}
                        </p>
                      </div>
                    ))}
                </div>
              </TabsContent>
              <TabsContent value="tools">
                <div className="rounded-md border max-h-[480px] overflow-y-auto divide-y divide-border text-sm">
                  {state.toolCalls.length === 0 && (
                    <p className="p-4 text-muted-foreground text-sm">
                      No tool calls yet.
                    </p>
                  )}
                  {state.toolCalls
                    .slice()
                    .reverse()
                    .map((t, i) => (
                      <div key={i} className="p-3 font-mono text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {t.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(t.ts).toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                          {JSON.stringify(t.args, null, 2)}
                        </pre>
                      </div>
                    ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {state.decision && (
        <Card>
          <CardHeader>
            <CardTitle>Final trade decision</CardTitle>
            <CardDescription>
              Output of the Portfolio Manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Markdown source={state.decision} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const SECTION_TITLES: Record<string, string> = {
  market_report: "Market",
  sentiment_report: "Social",
  news_report: "News",
  fundamentals_report: "Fundamentals",
  investment_plan: "Research",
  trader_investment_plan: "Trader",
  final_trade_decision: "Decision",
};

function SummaryStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <Badge variant="success">completed</Badge>;
  if (status === "in_progress")
    return (
      <Badge variant="warning" className="animate-pulse-soft">
        in progress
      </Badge>
    );
  return <Badge variant="muted">{status}</Badge>;
}
