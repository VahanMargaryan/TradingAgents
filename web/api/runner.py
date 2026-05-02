"""Background runner for TradingAgents analysis runs.

The runner replicates the CLI's chunk-processing logic but, instead of
rendering Rich panels, emits structured events into the run's event queue.
The web UI consumes these events via Server-Sent Events.
"""

from __future__ import annotations

import ast
import threading
import traceback
from typing import Any, Dict, List, Optional

from .store import Run, RunStore


# Mirrors cli.main.MessageBuffer constants so the UI stays consistent.
ANALYST_MAPPING = {
    "market": "Market Analyst",
    "social": "Social Analyst",
    "news": "News Analyst",
    "fundamentals": "Fundamentals Analyst",
}

FIXED_AGENTS = {
    "Research Team": ["Bull Researcher", "Bear Researcher", "Research Manager"],
    "Trading Team": ["Trader"],
    "Risk Management": ["Aggressive Analyst", "Neutral Analyst", "Conservative Analyst"],
    "Portfolio Management": ["Portfolio Manager"],
}

REPORT_SECTIONS = {
    "market_report": ("market", "Market Analyst"),
    "sentiment_report": ("social", "Social Analyst"),
    "news_report": ("news", "News Analyst"),
    "fundamentals_report": ("fundamentals", "Fundamentals Analyst"),
    "investment_plan": (None, "Research Manager"),
    "trader_investment_plan": (None, "Trader"),
    "final_trade_decision": (None, "Portfolio Manager"),
}

REPORT_SECTION_TITLES = {
    "market_report": "Market Analysis",
    "sentiment_report": "Social Sentiment",
    "news_report": "News Analysis",
    "fundamentals_report": "Fundamentals Analysis",
    "investment_plan": "Research Team Decision",
    "trader_investment_plan": "Trading Team Plan",
    "final_trade_decision": "Portfolio Management Decision",
}


def _is_empty(val: Any) -> bool:
    if val is None or val == "":
        return True
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return True
        try:
            return not bool(ast.literal_eval(s))
        except (ValueError, SyntaxError):
            return False
    return not bool(val)


def _extract_content_string(content: Any) -> Optional[str]:
    if _is_empty(content):
        return None
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        text = content.get("text", "")
        return text.strip() if not _is_empty(text) else None
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")).strip())
            elif isinstance(item, str):
                parts.append(item.strip())
        result = " ".join(p for p in parts if p)
        return result or None
    return str(content).strip() or None


def _classify_message(message: Any) -> tuple[str, Optional[str]]:
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    content = _extract_content_string(getattr(message, "content", None))
    if isinstance(message, HumanMessage):
        if content and content.strip() == "Continue":
            return ("Control", content)
        return ("User", content)
    if isinstance(message, ToolMessage):
        return ("Data", content)
    if isinstance(message, AIMessage):
        return ("Agent", content)
    return ("System", content)


def _initial_agent_status(analysts: List[str]) -> Dict[str, str]:
    status: Dict[str, str] = {}
    for key in analysts:
        if key in ANALYST_MAPPING:
            status[ANALYST_MAPPING[key]] = "pending"
    for team in FIXED_AGENTS.values():
        for agent in team:
            status[agent] = "pending"
    return status


def _initial_reports(analysts: List[str]) -> Dict[str, Optional[str]]:
    out: Dict[str, Optional[str]] = {}
    for section, (analyst_key, _) in REPORT_SECTIONS.items():
        if analyst_key is None or analyst_key in analysts:
            out[section] = None
    return out


def _set_agent_status(run: Run, agent: str, status: str) -> None:
    if agent not in run.agent_status:
        return
    if run.agent_status[agent] == status:
        return
    run.agent_status[agent] = status
    run.append_event(
        "agent_status",
        {"agent": agent, "status": status, "agent_status": dict(run.agent_status)},
    )


def _update_report(run: Run, section: str, content: str) -> None:
    if section not in run.reports:
        return
    if run.reports[section] == content:
        return
    run.reports[section] = content
    run.append_event(
        "report",
        {
            "section": section,
            "title": REPORT_SECTION_TITLES.get(section, section),
            "content": content,
        },
    )


def _update_research_team_status(run: Run, status: str) -> None:
    for agent in FIXED_AGENTS["Research Team"]:
        _set_agent_status(run, agent, status)


def _update_analyst_statuses(run: Run, chunk: Dict[str, Any], selected: List[str]) -> None:
    """Mirror cli.main.update_analyst_statuses: progress analysts as their reports land."""
    selected_agents = [ANALYST_MAPPING[k] for k in selected if k in ANALYST_MAPPING]
    found_active = False
    for section, (analyst_key, finalizing_agent) in REPORT_SECTIONS.items():
        if analyst_key not in selected:
            continue
        if not chunk.get(section):
            continue
        if run.agent_status.get(finalizing_agent) != "completed":
            _set_agent_status(run, finalizing_agent, "completed")
            # Promote the next pending analyst to in_progress.
            for next_agent in selected_agents:
                if run.agent_status.get(next_agent) == "pending":
                    _set_agent_status(run, next_agent, "in_progress")
                    break
        found_active = True
    if not found_active and selected_agents:
        if run.agent_status.get("Bull Researcher") == "pending":
            _set_agent_status(run, "Bull Researcher", "in_progress")


def _process_chunk(run: Run, chunk: Dict[str, Any], selected: List[str]) -> None:
    # Stream messages.
    for message in chunk.get("messages", []) or []:
        msg_type, content = _classify_message(message)
        if content:
            run.append_event(
                "message",
                {"role": msg_type, "content": content[:4000]},
            )
        tool_calls = getattr(message, "tool_calls", None)
        if tool_calls:
            for tool_call in tool_calls:
                if isinstance(tool_call, dict):
                    name = tool_call.get("name")
                    args = tool_call.get("args")
                else:
                    name = getattr(tool_call, "name", None)
                    args = getattr(tool_call, "args", None)
                if name:
                    run.append_event("tool_call", {"name": name, "args": args})

    _update_analyst_statuses(run, chunk, selected)

    # Direct section updates.
    for section in list(run.reports.keys()):
        value = chunk.get(section)
        if isinstance(value, str) and value:
            _update_report(run, section, value)

    # Investment debate (research team).
    debate_state = chunk.get("investment_debate_state")
    if debate_state:
        bull = (debate_state.get("bull_history") or "").strip()
        bear = (debate_state.get("bear_history") or "").strip()
        judge = (debate_state.get("judge_decision") or "").strip()

        if bull or bear:
            for agent in FIXED_AGENTS["Research Team"]:
                if run.agent_status.get(agent) == "pending":
                    _set_agent_status(run, agent, "in_progress")
        composed: List[str] = []
        if bull:
            composed.append(f"### Bull Researcher Analysis\n{bull}")
        if bear:
            composed.append(f"### Bear Researcher Analysis\n{bear}")
        if judge:
            composed.append(f"### Research Manager Decision\n{judge}")
            _update_research_team_status(run, "completed")
            _set_agent_status(run, "Trader", "in_progress")
        if composed:
            _update_report(run, "investment_plan", "\n\n".join(composed))

    # Trading team.
    if chunk.get("trader_investment_plan"):
        _update_report(run, "trader_investment_plan", chunk["trader_investment_plan"])
        if run.agent_status.get("Trader") != "completed":
            _set_agent_status(run, "Trader", "completed")
            _set_agent_status(run, "Aggressive Analyst", "in_progress")

    # Risk debate.
    risk_state = chunk.get("risk_debate_state")
    if risk_state:
        agg = (risk_state.get("aggressive_history") or "").strip()
        con = (risk_state.get("conservative_history") or "").strip()
        neu = (risk_state.get("neutral_history") or "").strip()
        judge = (risk_state.get("judge_decision") or "").strip()
        composed: List[str] = []
        if agg:
            if run.agent_status.get("Aggressive Analyst") != "completed":
                _set_agent_status(run, "Aggressive Analyst", "in_progress")
            composed.append(f"### Aggressive Analyst Analysis\n{agg}")
        if con:
            if run.agent_status.get("Conservative Analyst") != "completed":
                _set_agent_status(run, "Conservative Analyst", "in_progress")
            composed.append(f"### Conservative Analyst Analysis\n{con}")
        if neu:
            if run.agent_status.get("Neutral Analyst") != "completed":
                _set_agent_status(run, "Neutral Analyst", "in_progress")
            composed.append(f"### Neutral Analyst Analysis\n{neu}")
        if judge:
            composed.append(f"### Portfolio Manager Decision\n{judge}")
            for a in ("Aggressive Analyst", "Conservative Analyst", "Neutral Analyst", "Portfolio Manager"):
                _set_agent_status(run, a, "completed")
        if composed:
            _update_report(run, "final_trade_decision", "\n\n".join(composed))


def _build_config(overrides: Dict[str, Any]) -> Dict[str, Any]:
    from tradingagents.default_config import DEFAULT_CONFIG

    config = DEFAULT_CONFIG.copy()
    # Allow only known top-level keys to be overridden.
    allowed = {
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
    for key, value in (overrides or {}).items():
        if key in allowed and value is not None:
            config[key] = value
    if config.get("llm_provider"):
        config["llm_provider"] = str(config["llm_provider"]).lower()
    return config


def _run(run: Run, store: RunStore) -> None:
    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        run.status = "running"
        run.started_at = run.created_at  # filled by caller for created_at; approximate
        from datetime import datetime, timezone

        run.started_at = datetime.now(timezone.utc).isoformat()
        store.persist(run)
        run.append_event("status", {"status": run.status})

        config = _build_config(run.config_overrides)
        run.agent_status = _initial_agent_status(run.analysts)
        run.reports = _initial_reports(run.analysts)
        run.append_event(
            "init",
            {
                "agent_status": dict(run.agent_status),
                "reports": dict(run.reports),
                "config": {
                    "llm_provider": config.get("llm_provider"),
                    "deep_think_llm": config.get("deep_think_llm"),
                    "quick_think_llm": config.get("quick_think_llm"),
                    "max_debate_rounds": config.get("max_debate_rounds"),
                    "max_risk_discuss_rounds": config.get("max_risk_discuss_rounds"),
                    "output_language": config.get("output_language"),
                },
            },
        )

        # Promote the first selected analyst to in_progress.
        for key in run.analysts:
            agent = ANALYST_MAPPING.get(key)
            if agent and run.agent_status.get(agent) == "pending":
                _set_agent_status(run, agent, "in_progress")
                break

        graph = TradingAgentsGraph(
            selected_analysts=list(run.analysts),
            config=config,
            debug=True,
        )

        init_state = graph.propagator.create_initial_state(run.ticker, run.trade_date)
        args = graph.propagator.get_graph_args()

        final_state: Optional[Dict[str, Any]] = None
        for chunk in graph.graph.stream(init_state, **args):
            if run.is_cancelled():
                run.status = "cancelled"
                run.append_event("status", {"status": run.status})
                break
            _process_chunk(run, chunk, run.analysts)
            final_state = chunk

        if run.status == "cancelled":
            from datetime import datetime, timezone

            run.finished_at = datetime.now(timezone.utc).isoformat()
            store.persist(run)
            return

        if final_state is not None:
            for section in list(run.reports.keys()):
                value = final_state.get(section)
                if isinstance(value, str) and value:
                    _update_report(run, section, value)

            for agent in list(run.agent_status.keys()):
                _set_agent_status(run, agent, "completed")

            decision_text = final_state.get("final_trade_decision") or ""
            run.decision = decision_text
            try:
                run.signal = graph.process_signal(decision_text)
            except Exception:  # signal extraction is best-effort
                run.signal = None

        run.status = "completed"
        from datetime import datetime, timezone

        run.finished_at = datetime.now(timezone.utc).isoformat()
        run.append_event(
            "status",
            {"status": run.status, "decision": run.decision, "signal": run.signal},
        )
    except Exception as exc:  # noqa: BLE001
        run.status = "failed"
        run.error = f"{type(exc).__name__}: {exc}"
        from datetime import datetime, timezone

        run.finished_at = datetime.now(timezone.utc).isoformat()
        run.append_event(
            "status",
            {"status": run.status, "error": run.error, "traceback": traceback.format_exc()},
        )
    finally:
        store.persist(run)


def start_run(run: Run, store: RunStore) -> threading.Thread:
    thread = threading.Thread(target=_run, args=(run, store), name=f"run-{run.id}", daemon=True)
    thread.start()
    return thread
