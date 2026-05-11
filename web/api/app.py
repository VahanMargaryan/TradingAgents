"""FastAPI application exposing TradingAgents to the web UI."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Load .env files like the CLI does so the API picks up provider keys.
load_dotenv()
load_dotenv(".env.enterprise", override=False)

from tradingagents.default_config import DEFAULT_CONFIG  # noqa: E402
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS  # noqa: E402

from .runner import ANALYST_MAPPING, FIXED_AGENTS, REPORT_SECTION_TITLES, start_run  # noqa: E402
from .store import get_store  # noqa: E402


CONFIG_PATH = Path(
    os.getenv(
        "TRADINGAGENTS_WEB_CONFIG_PATH",
        os.path.join(os.path.expanduser("~"), ".tradingagents", "web_config.json"),
    )
)

CONFIG_ALLOWED_KEYS = {
    "llm_provider",
    "deep_think_llm",
    "quick_think_llm",
    "backend_url",
    "max_debate_rounds",
    "max_risk_discuss_rounds",
    "output_language",
    "google_thinking_level",
    "openai_reasoning_effort",
    "anthropic_effort",
    "checkpoint_enabled",
    "data_vendors",
}

# The full descriptive catalog the UI uses to render agent cards.
AGENTS_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "market",
        "name": "Market Analyst",
        "team": "Analyst Team",
        "selectable": True,
        "description": "Reads price action and technical indicators (RSI, MACD, moving averages) and writes the market_report.",
        "report": "market_report",
    },
    {
        "id": "social",
        "name": "Social Analyst",
        "team": "Analyst Team",
        "selectable": True,
        "description": "Aggregates social-media chatter and sentiment signals into the sentiment_report.",
        "report": "sentiment_report",
    },
    {
        "id": "news",
        "name": "News Analyst",
        "team": "Analyst Team",
        "selectable": True,
        "description": "Summarises macro and company-specific news into the news_report.",
        "report": "news_report",
    },
    {
        "id": "fundamentals",
        "name": "Fundamentals Analyst",
        "team": "Analyst Team",
        "selectable": True,
        "description": "Examines balance sheet, cash flow, and income statements to produce the fundamentals_report.",
        "report": "fundamentals_report",
    },
    {
        "id": "bull_researcher",
        "name": "Bull Researcher",
        "team": "Research Team",
        "selectable": False,
        "description": "Argues the bullish thesis during the research debate.",
    },
    {
        "id": "bear_researcher",
        "name": "Bear Researcher",
        "team": "Research Team",
        "selectable": False,
        "description": "Argues the bearish counter-thesis during the research debate.",
    },
    {
        "id": "research_manager",
        "name": "Research Manager",
        "team": "Research Team",
        "selectable": False,
        "description": "Resolves the bull/bear debate and writes the investment_plan.",
        "report": "investment_plan",
    },
    {
        "id": "trader",
        "name": "Trader",
        "team": "Trading Team",
        "selectable": False,
        "description": "Translates the research plan into an executable trader_investment_plan.",
        "report": "trader_investment_plan",
    },
    {
        "id": "aggressive_analyst",
        "name": "Aggressive Analyst",
        "team": "Risk Management",
        "selectable": False,
        "description": "Pushes the higher-risk perspective during the risk debate.",
    },
    {
        "id": "neutral_analyst",
        "name": "Neutral Analyst",
        "team": "Risk Management",
        "selectable": False,
        "description": "Argues the balanced middle ground during the risk debate.",
    },
    {
        "id": "conservative_analyst",
        "name": "Conservative Analyst",
        "team": "Risk Management",
        "selectable": False,
        "description": "Argues the lower-risk position during the risk debate.",
    },
    {
        "id": "portfolio_manager",
        "name": "Portfolio Manager",
        "team": "Portfolio Management",
        "selectable": False,
        "description": "Synthesises the risk debate and renders the final_trade_decision.",
        "report": "final_trade_decision",
    },
]


def _load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text())
            return {k: v for k, v in data.items() if k in CONFIG_ALLOWED_KEYS}
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def _save_config(config: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {k: v for k, v in (config or {}).items() if k in CONFIG_ALLOWED_KEYS}
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cleaned, indent=2))
    return cleaned


def _provider_key_status() -> Dict[str, bool]:
    """Best-effort indicator of which provider API keys are present in env."""
    return {
        "openai": bool(os.getenv("OPENAI_API_KEY")),
        "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
        "google": bool(os.getenv("GOOGLE_API_KEY")),
        "xai": bool(os.getenv("XAI_API_KEY")),
        "deepseek": bool(os.getenv("DEEPSEEK_API_KEY")),
        "qwen": bool(os.getenv("DASHSCOPE_API_KEY")),
        "glm": bool(os.getenv("ZHIPU_API_KEY")),
        "openrouter": bool(os.getenv("OPENROUTER_API_KEY")),
        "azure": bool(os.getenv("AZURE_OPENAI_API_KEY") and os.getenv("AZURE_OPENAI_ENDPOINT")),
        "ollama": True,  # local; no key needed
    }


# --- Pydantic schemas --------------------------------------------------------


class ConfigPayload(BaseModel):
    llm_provider: Optional[str] = None
    deep_think_llm: Optional[str] = None
    quick_think_llm: Optional[str] = None
    backend_url: Optional[str] = None
    max_debate_rounds: Optional[int] = Field(default=None, ge=1, le=10)
    max_risk_discuss_rounds: Optional[int] = Field(default=None, ge=1, le=10)
    output_language: Optional[str] = None
    google_thinking_level: Optional[str] = None
    openai_reasoning_effort: Optional[str] = None
    anthropic_effort: Optional[str] = None
    checkpoint_enabled: Optional[bool] = None
    data_vendors: Optional[Dict[str, str]] = None


class CreateRunPayload(BaseModel):
    ticker: str = Field(min_length=1, max_length=32)
    trade_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    analysts: List[str] = Field(default_factory=list)
    config_overrides: Optional[ConfigPayload] = None


# --- App ---------------------------------------------------------------------


app = FastAPI(title="TradingAgents Web API", version="0.1.0")

cors_origins_raw = os.getenv("TRADINGAGENTS_WEB_CORS", "*")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "time": datetime.utcnow().isoformat()}


@app.get("/api/agents")
def list_agents() -> Dict[str, Any]:
    teams: Dict[str, List[Dict[str, Any]]] = {}
    for agent in AGENTS_CATALOG:
        teams.setdefault(agent["team"], []).append(agent)
    return {"agents": AGENTS_CATALOG, "teams": teams, "selectable_ids": list(ANALYST_MAPPING.keys())}


@app.get("/api/models")
def list_models() -> Dict[str, Any]:
    catalog: Dict[str, Any] = {}
    for provider, modes in MODEL_OPTIONS.items():
        catalog[provider] = {
            mode: [{"label": label, "value": value} for label, value in options]
            for mode, options in modes.items()
        }
    return {
        "providers": list(catalog.keys()),
        "catalog": catalog,
        "provider_keys_set": _provider_key_status(),
    }


def _ollama_root(base_url: Optional[str]) -> str:
    """Strip any path (e.g. ``/v1``) so we can reach Ollama's native API."""
    candidate = (base_url or "").strip() or "http://localhost:11434"
    parsed = urlparse(candidate if "://" in candidate else f"http://{candidate}")
    return urlunparse((parsed.scheme or "http", parsed.netloc or parsed.path, "", "", "", ""))


@app.get("/api/ollama/models")
def list_ollama_models(
    backend_url: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Return models installed on the configured Ollama server."""
    base = backend_url or _load_config().get("backend_url") or "http://localhost:11434"
    root = _ollama_root(base)
    tags_url = f"{root.rstrip('/')}/api/tags"
    try:
        req = urllib.request.Request(tags_url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        return {"server": root, "reachable": False, "error": str(exc), "models": []}
    except (json.JSONDecodeError, ValueError) as exc:
        return {"server": root, "reachable": False, "error": f"Invalid response: {exc}", "models": []}

    models: List[Dict[str, Any]] = []
    for entry in payload.get("models", []) or []:
        name = entry.get("name") or entry.get("model")
        if not name:
            continue
        size_bytes = entry.get("size")
        details = entry.get("details") or {}
        param_size = details.get("parameter_size")
        suffix_parts = [p for p in (param_size, details.get("quantization_level")) if p]
        suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
        models.append({
            "label": f"{name}{suffix}",
            "value": name,
            "size_bytes": size_bytes,
            "parameter_size": param_size,
            "quantization_level": details.get("quantization_level"),
            "family": details.get("family"),
        })
    models.sort(key=lambda m: m["value"])
    return {"server": root, "reachable": True, "models": models}


@app.get("/api/config")
def get_config() -> Dict[str, Any]:
    overrides = _load_config()
    effective = {k: v for k, v in DEFAULT_CONFIG.items() if k in CONFIG_ALLOWED_KEYS}
    effective.update(overrides)
    return {
        "defaults": {k: v for k, v in DEFAULT_CONFIG.items() if k in CONFIG_ALLOWED_KEYS},
        "overrides": overrides,
        "effective": effective,
    }


@app.put("/api/config")
def put_config(payload: ConfigPayload) -> Dict[str, Any]:
    incoming = payload.model_dump(exclude_none=True)
    saved = _save_config(incoming)
    return {"overrides": saved}


@app.get("/api/report-sections")
def report_sections() -> Dict[str, Any]:
    return {"sections": REPORT_SECTION_TITLES}


@app.get("/api/runs")
def list_runs() -> Dict[str, Any]:
    store = get_store()
    return {"runs": [r.to_dict() for r in store.list()]}


@app.post("/api/runs")
def create_run(payload: CreateRunPayload) -> Dict[str, Any]:
    selectable = set(ANALYST_MAPPING.keys())
    analysts = [a for a in payload.analysts if a in selectable]
    if not analysts:
        raise HTTPException(
            status_code=400,
            detail=f"At least one analyst is required. Allowed: {sorted(selectable)}",
        )

    overrides: Dict[str, Any] = {}
    if payload.config_overrides is not None:
        overrides = payload.config_overrides.model_dump(exclude_none=True)
    # Merge in any persisted defaults so the user doesn't need to repeat them.
    persisted = _load_config()
    merged = {**persisted, **overrides}

    store = get_store()
    run = store.create(
        ticker=payload.ticker.strip().upper(),
        trade_date=payload.trade_date,
        analysts=analysts,
        config_overrides=merged,
    )
    start_run(run, store)
    return run.to_dict()


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> Dict[str, Any]:
    store = get_store()
    run = store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.to_dict(include_events=True)


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str) -> Dict[str, Any]:
    store = get_store()
    run = store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="Cancel the run before deleting it")
    store.delete(run_id)
    return {"deleted": run_id}


@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> Dict[str, Any]:
    store = get_store()
    run = store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in {"queued", "running"}:
        return run.to_dict()
    run.request_cancel()
    return run.to_dict()


@app.get("/api/runs/{run_id}/events")
def stream_events(run_id: str):
    store = get_store()
    run = store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    def event_generator():
        last_index = 0
        # Replay buffered events first so reconnecting clients catch up.
        while True:
            current_len = len(run.events)
            while last_index < current_len:
                event = run.events[last_index]
                last_index += 1
                yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
            if run.status not in {"queued", "running"} and last_index >= len(run.events):
                yield "event: end\ndata: {}\n\n"
                break
            run.wait_for_event(last_index, timeout=15.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/runs/{run_id}/report")
def get_report(run_id: str) -> Dict[str, Any]:
    store = get_store()
    run = store.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": run.id,
        "ticker": run.ticker,
        "trade_date": run.trade_date,
        "decision": run.decision,
        "signal": run.signal,
        "reports": run.reports,
        "report_titles": REPORT_SECTION_TITLES,
        "status": run.status,
    }
