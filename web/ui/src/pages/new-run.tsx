import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, PlayCircle } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

export function NewRunPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: api.agents });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: api.models });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config });

  const [ticker, setTicker] = useState("");
  const [tradeDate, setTradeDate] = useState(DEFAULT_DATE);
  const [selectedAnalysts, setSelectedAnalysts] = useState<string[]>([
    "market",
    "social",
    "news",
    "fundamentals",
  ]);
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [quickModel, setQuickModel] = useState<string | undefined>(undefined);
  const [deepModel, setDeepModel] = useState<string | undefined>(undefined);
  const [debateRounds, setDebateRounds] = useState<number>(1);
  const [riskRounds, setRiskRounds] = useState<number>(1);
  const [language, setLanguage] = useState<string>("English");
  const [overrideModels, setOverrideModels] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const effective = configQuery.data?.effective ?? {};
  const defaults = configQuery.data?.defaults ?? {};

  // Hydrate defaults once config is available.
  useMemo(() => {
    if (!configQuery.data) return;
    setProvider((p) => p ?? (effective.llm_provider as string | undefined));
    setQuickModel((q) => q ?? (effective.quick_think_llm as string | undefined));
    setDeepModel((d) => d ?? (effective.deep_think_llm as string | undefined));
    setDebateRounds(
      (effective.max_debate_rounds as number | undefined) ??
        (defaults.max_debate_rounds as number) ??
        1,
    );
    setRiskRounds(
      (effective.max_risk_discuss_rounds as number | undefined) ??
        (defaults.max_risk_discuss_rounds as number) ??
        1,
    );
    setLanguage((effective.output_language as string) ?? "English");
  }, [configQuery.data]);

  const providers = modelsQuery.data?.providers ?? [];
  const providerCatalog = provider ? modelsQuery.data?.catalog[provider] : undefined;

  const createMutation = useMutation({
    mutationFn: api.createRun,
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      navigate(`/runs/${run.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggleAnalyst = (id: string) => {
    setSelectedAnalysts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!ticker.trim()) {
      setError("Ticker is required.");
      return;
    }
    if (selectedAnalysts.length === 0) {
      setError("Select at least one analyst.");
      return;
    }
    const overrides: Record<string, unknown> = {
      max_debate_rounds: debateRounds,
      max_risk_discuss_rounds: riskRounds,
      output_language: language,
    };
    if (overrideModels) {
      if (provider) overrides.llm_provider = provider;
      if (quickModel) overrides.quick_think_llm = quickModel;
      if (deepModel) overrides.deep_think_llm = deepModel;
    }
    createMutation.mutate({
      ticker: ticker.trim().toUpperCase(),
      trade_date: tradeDate,
      analysts: selectedAnalysts,
      config_overrides: overrides,
    });
  };

  const selectableAgents =
    agentsQuery.data?.agents.filter((a) => a.selectable) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="New analysis run"
        description="Pick a ticker, the analysts that should weigh in, and any per-run overrides."
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Run target</CardTitle>
            <CardDescription>
              Ticker symbol exactly as listed on its exchange. Example: <code>NVDA</code>, <code>7203.T</code>, <code>0700.HK</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ticker">Ticker</Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="NVDA"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trade-date">Trade date</Label>
              <Input
                id="trade-date"
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Debate depth</CardTitle>
            <CardDescription>
              How many back-and-forth rounds the research and risk teams run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="debate-rounds">Research debate rounds</Label>
              <Input
                id="debate-rounds"
                type="number"
                min={1}
                max={10}
                value={debateRounds}
                onChange={(e) => setDebateRounds(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="risk-rounds">Risk debate rounds</Label>
              <Input
                id="risk-rounds"
                type="number"
                min={1}
                max={10}
                value={riskRounds}
                onChange={(e) => setRiskRounds(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="language">Output language</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Analysts</CardTitle>
            <CardDescription>
              Pick which analysts contribute reports. The research, trading, risk, and portfolio teams always run.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {selectableAgents.map((agent) => {
              const checked = selectedAnalysts.includes(agent.id);
              return (
                <button
                  type="button"
                  key={agent.id}
                  onClick={() => toggleAnalyst(agent.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent/40",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {checked && (
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2 6 5 9 10 3" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {agent.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Models</CardTitle>
              <CardDescription>
                Use saved config or override for this run.
              </CardDescription>
            </div>
            <Switch
              checked={overrideModels}
              onCheckedChange={setOverrideModels}
              aria-label="Override models for this run"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {!overrideModels && (
              <p className="text-xs text-muted-foreground">
                Using <strong>{(effective.llm_provider as string) ?? "default"}</strong>{" "}
                / quick: <code>{(effective.quick_think_llm as string) ?? "default"}</code>{" "}
                / deep: <code>{(effective.deep_think_llm as string) ?? "default"}</code>.
              </p>
            )}
            {overrideModels && (
              <>
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(value) => {
                      setProvider(value);
                      setQuickModel(undefined);
                      setDeepModel(undefined);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quick model</Label>
                  <Select value={quickModel} onValueChange={setQuickModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select quick model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(providerCatalog?.quick ?? []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Deep model</Label>
                  <Select value={deepModel} onValueChange={setDeepModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select deep model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(providerCatalog?.deep ?? []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="lg:col-span-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <div className="lg:col-span-3 flex justify-end gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Start analysis
          </Button>
        </div>
      </form>
    </div>
  );
}
