import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";

import { api } from "@/lib/api";
import type { ModelOption, ProviderCatalog } from "@/lib/api";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";

type FormState = {
  llm_provider?: string;
  quick_think_llm?: string;
  deep_think_llm?: string;
  backend_url?: string;
  max_debate_rounds?: number;
  max_risk_discuss_rounds?: number;
  output_language?: string;
  checkpoint_enabled?: boolean;
  data_vendors?: Record<string, string>;
};

const VENDOR_KEYS = [
  "core_stock_apis",
  "technical_indicators",
  "fundamental_data",
  "news_data",
] as const;
const VENDOR_OPTIONS = ["yfinance", "alpha_vantage"] as const;

export function ConfigPage() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config });
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: api.models });

  const [form, setForm] = useState<FormState>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!configQuery.data) return;
    const e = configQuery.data.effective;
    setForm({
      llm_provider: (e.llm_provider as string) || undefined,
      quick_think_llm: (e.quick_think_llm as string) || undefined,
      deep_think_llm: (e.deep_think_llm as string) || undefined,
      backend_url: (e.backend_url as string) || "",
      max_debate_rounds: (e.max_debate_rounds as number) ?? 1,
      max_risk_discuss_rounds: (e.max_risk_discuss_rounds as number) ?? 1,
      output_language: (e.output_language as string) || "English",
      checkpoint_enabled: !!e.checkpoint_enabled,
      data_vendors:
        (e.data_vendors as Record<string, string> | undefined) ?? {},
    });
  }, [configQuery.data]);

  const providers = modelsQuery.data?.providers ?? [];
  const staticCatalog = form.llm_provider
    ? modelsQuery.data?.catalog[form.llm_provider]
    : undefined;
  const providerKeys = modelsQuery.data?.provider_keys_set ?? {};

  const isOllama = form.llm_provider === "ollama";
  const ollamaQuery = useQuery({
    queryKey: ["ollama-models", form.backend_url ?? ""],
    queryFn: () =>
      api.ollamaModels(form.backend_url ? form.backend_url : undefined),
    enabled: isOllama,
    refetchOnWindowFocus: false,
  });

  const providerCatalog: ProviderCatalog | undefined = useMemo(() => {
    if (!isOllama) return staticCatalog;
    const live: ModelOption[] = (ollamaQuery.data?.models ?? []).map((m) => ({
      label: m.label,
      value: m.value,
    }));
    const merge = (extras: ModelOption[] | undefined): ModelOption[] => {
      const seen = new Set(live.map((o) => o.value));
      const tail = (extras ?? []).filter((o) => !seen.has(o.value));
      return [...live, ...tail];
    };
    return {
      quick: merge(staticCatalog?.quick),
      deep: merge(staticCatalog?.deep),
    };
  }, [isOllama, ollamaQuery.data, staticCatalog]);

  const saveMutation = useMutation({
    mutationFn: (overrides: Record<string, unknown>) =>
      api.saveConfig(overrides),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      llm_provider: form.llm_provider,
      quick_think_llm: form.quick_think_llm,
      deep_think_llm: form.deep_think_llm,
      backend_url: form.backend_url ? form.backend_url : null,
      max_debate_rounds: form.max_debate_rounds,
      max_risk_discuss_rounds: form.max_risk_discuss_rounds,
      output_language: form.output_language,
      checkpoint_enabled: form.checkpoint_enabled,
      data_vendors: form.data_vendors,
    };
    // strip undefined or empty optional strings to keep the override clean
    Object.keys(payload).forEach((k) => {
      const v = payload[k];
      if (v === undefined) delete payload[k];
    });
    saveMutation.mutate(payload);
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateVendor = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      data_vendors: { ...(prev.data_vendors ?? {}), [key]: value },
    }));
  };

  const providerKeyMissing = useMemo(() => {
    if (!form.llm_provider) return false;
    if (form.llm_provider === "ollama") return false;
    return providerKeys[form.llm_provider] === false;
  }, [form.llm_provider, providerKeys]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration"
        description="Defaults applied to every run, persisted to ~/.tradingagents/web_config.json. Override per-run when starting an analysis."
      />

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>LLM provider</CardTitle>
            <CardDescription>
              Choose which provider and models the agents call by default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={form.llm_provider}
                onValueChange={(value) => {
                  setForm((prev) => ({
                    ...prev,
                    llm_provider: value,
                    quick_think_llm: undefined,
                    deep_think_llm: undefined,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center justify-between gap-3 w-full">
                        <span className="capitalize">{p}</span>
                        {providerKeys[p] === false && p !== "ollama" && (
                          <Badge variant="muted">key missing</Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {providerKeyMissing && (
                <p className="text-xs text-warning">
                  No API key detected for this provider. Set it in your{" "}
                  <code>.env</code> before running.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Quick model</Label>
              <Select
                value={form.quick_think_llm}
                onValueChange={(v) => update("quick_think_llm", v)}
              >
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
              <Select
                value={form.deep_think_llm}
                onValueChange={(v) => update("deep_think_llm", v)}
              >
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
            <div className="space-y-1.5">
              <Label htmlFor="backend-url">
                {isOllama
                  ? "Ollama server URL"
                  : "Custom backend URL (optional)"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="backend-url"
                  placeholder={
                    isOllama
                      ? "http://localhost:11434/v1"
                      : "https://api.example.com/v1"
                  }
                  value={form.backend_url ?? ""}
                  onChange={(e) => update("backend_url", e.target.value)}
                />
                {isOllama && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => ollamaQuery.refetch()}
                    disabled={ollamaQuery.isFetching}
                    aria-label="Refresh Ollama models"
                  >
                    {ollamaQuery.isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                )}
              </div>
              {isOllama && (
                <p className="text-xs text-muted-foreground">
                  Trailing <code>/v1</code> is added automatically — bare
                  hosts like <code>http://host:11434</code> work too.
                </p>
              )}
              {isOllama && ollamaQuery.data && (
                <p
                  className={
                    ollamaQuery.data.reachable
                      ? "text-xs text-success flex items-center gap-1"
                      : "text-xs text-destructive flex items-start gap-1"
                  }
                >
                  {ollamaQuery.data.reachable ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Connected to {ollamaQuery.data.server} ·{" "}
                      {ollamaQuery.data.models.length} model
                      {ollamaQuery.data.models.length === 1 ? "" : "s"} detected
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                      <span>
                        Cannot reach {ollamaQuery.data.server}:{" "}
                        {ollamaQuery.data.error ?? "unreachable"}
                      </span>
                    </>
                  )}
                </p>
              )}
              {isOllama &&
                ollamaQuery.data?.reachable &&
                form.quick_think_llm &&
                !ollamaQuery.data.models.some(
                  (m) => m.value === form.quick_think_llm,
                ) && (
                  <p className="text-xs text-warning flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                    <span>
                      Quick model <code>{form.quick_think_llm}</code> is not
                      installed on this server — pull it on the host or pick a
                      detected model.
                    </span>
                  </p>
                )}
              {isOllama &&
                ollamaQuery.data?.reachable &&
                form.deep_think_llm &&
                !ollamaQuery.data.models.some(
                  (m) => m.value === form.deep_think_llm,
                ) && (
                  <p className="text-xs text-warning flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                    <span>
                      Deep model <code>{form.deep_think_llm}</code> is not
                      installed on this server — pull it on the host or pick a
                      detected model.
                    </span>
                  </p>
                )}
              {isOllama && !ollamaQuery.data && ollamaQuery.isFetching && (
                <p className="text-xs text-muted-foreground">
                  Querying Ollama server…
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run behaviour</CardTitle>
            <CardDescription>
              Pipeline defaults applied to every analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-debate">Research debate rounds</Label>
              <Input
                id="cfg-debate"
                type="number"
                min={1}
                max={10}
                value={form.max_debate_rounds ?? 1}
                onChange={(e) =>
                  update("max_debate_rounds", Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-risk">Risk debate rounds</Label>
              <Input
                id="cfg-risk"
                type="number"
                min={1}
                max={10}
                value={form.max_risk_discuss_rounds ?? 1}
                onChange={(e) =>
                  update("max_risk_discuss_rounds", Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-lang">Output language</Label>
              <Input
                id="cfg-lang"
                value={form.output_language ?? "English"}
                onChange={(e) => update("output_language", e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Checkpoint resume</Label>
                <p className="text-xs text-muted-foreground">
                  Persist graph state after each node so a crashed run can
                  resume.
                </p>
              </div>
              <Switch
                checked={!!form.checkpoint_enabled}
                onCheckedChange={(checked) =>
                  update("checkpoint_enabled", checked)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Data vendors</CardTitle>
            <CardDescription>
              Pick the data source per category. Alpha Vantage requires{" "}
              <code>ALPHA_VANTAGE_API_KEY</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {VENDOR_KEYS.map((key) => (
              <div className="space-y-1.5" key={key}>
                <Label className="capitalize">{key.replace(/_/g, " ")}</Label>
                <Select
                  value={form.data_vendors?.[key] ?? "yfinance"}
                  onValueChange={(v) => updateVendor(key, v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 flex items-center justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save defaults
          </Button>
        </div>
      </form>
    </div>
  );
}
