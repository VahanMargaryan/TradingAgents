import { useQuery } from "@tanstack/react-query";
import { Bot, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

export function AgentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent roster"
        description="The complete crew that runs each analysis. Selectable analysts can be picked when starting a new run; the rest run automatically as part of the pipeline."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <div className="space-y-6">
          {Object.entries(data.teams).map(([team, members]) => (
            <section key={team}>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {team}
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {members.map((agent) => (
                  <Card key={agent.id}>
                    <CardHeader className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                          <CardTitle className="text-sm">
                            {agent.name}
                          </CardTitle>
                        </div>
                        {agent.selectable ? (
                          <Badge variant="success">User-selectable</Badge>
                        ) : (
                          <Badge variant="muted">Pipeline</Badge>
                        )}
                      </div>
                      <CardDescription>{agent.description}</CardDescription>
                    </CardHeader>
                    {agent.report && (
                      <CardContent className="text-xs text-muted-foreground">
                        Writes <code className="px-1 py-0.5 bg-muted rounded">{agent.report}</code>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
