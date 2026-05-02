# TradingAgents Web Console

A web UI that lets you drive the multi-agent trading framework graphically:
configure providers and models, pick analysts, kick off analyses, and watch
each agent's progress and report stream in live.

```
web/
├── api/   # FastAPI service that wraps tradingagents.graph.TradingAgentsGraph
└── ui/    # Vite + React + TypeScript + Tailwind + shadcn/ui frontend
```

## Quickstart

Install Python deps once at the repo root (the API depends on the
`tradingagents` package itself):

```bash
pip install -e .
pip install -r web/api/requirements.txt
```

Install the UI deps:

```bash
cd web/ui
npm install
```

Set whichever provider keys you plan to use in `.env` at the repo root
(e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …).

### Run both processes

In one terminal, start the API:

```bash
python -m web.api.server
# → http://127.0.0.1:8765
```

In another, start the UI:

```bash
cd web/ui
npm run dev
# → http://127.0.0.1:5173
```

Open <http://127.0.0.1:5173>. Vite proxies `/api/*` to the FastAPI server.

For a one-shot production build:

```bash
cd web/ui
npm run build
# Static files end up in web/ui/dist/.
```

## Features

- **Dashboard** – at-a-glance run totals, recent runs, provider key status.
- **Agents** – descriptive cards for every agent in the pipeline, marking which
  ones are user-selectable for a run.
- **New Run** – ticker, trade date, analyst pickers, optional per-run model
  overrides, debate-round controls, output language.
- **Runs** – sortable history with cancel / delete actions.
- **Run detail** – live agent status badges, streaming reports per section
  (Markdown rendered), recent agent messages, tool-call log, final decision.
- **Config** – persist defaults to `~/.tradingagents/web_config.json` (provider,
  models, debate rounds, language, vendors, checkpoint resume).

## API surface

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET    | `/api/health` | Liveness probe |
| GET    | `/api/agents` | Agent roster + selectable IDs |
| GET    | `/api/models` | Model catalog + provider-key status |
| GET    | `/api/config` | Defaults, overrides, effective config |
| PUT    | `/api/config` | Persist override config |
| GET    | `/api/runs` | All runs |
| POST   | `/api/runs` | Start a new run |
| GET    | `/api/runs/{id}` | Run details + buffered events |
| DELETE | `/api/runs/{id}` | Remove a finished run |
| POST   | `/api/runs/{id}/cancel` | Request cancellation |
| GET    | `/api/runs/{id}/events` | Server-Sent Events stream |
| GET    | `/api/runs/{id}/report` | Final reports + signal |

Run history is persisted to `~/.tradingagents/web_runs/<run_id>.json` (override
with `TRADINGAGENTS_WEB_RUNS_DIR`). Config overrides live at
`~/.tradingagents/web_config.json` (override with
`TRADINGAGENTS_WEB_CONFIG_PATH`).

## Environment variables

| Var | Purpose | Default |
| --- | ------- | ------- |
| `TRADINGAGENTS_WEB_HOST` | API bind address | `127.0.0.1` |
| `TRADINGAGENTS_WEB_PORT` | API port | `8765` |
| `TRADINGAGENTS_WEB_CORS` | Comma-separated CORS origins | `*` |
| `VITE_API_PROXY` | Override Vite dev proxy target | `http://127.0.0.1:8765` |
