"""In-memory + JSON-persisted run store.

Runs are written to ``$TRADINGAGENTS_HOME/web_runs/<run_id>.json`` so the
history survives an API restart, while live state is held in memory for fast
streaming.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, List, Optional

DEFAULT_HOME = os.path.join(os.path.expanduser("~"), ".tradingagents")
RUNS_DIR = Path(os.getenv("TRADINGAGENTS_WEB_RUNS_DIR", os.path.join(DEFAULT_HOME, "web_runs")))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Run:
    """A single analysis run."""

    def __init__(
        self,
        ticker: str,
        trade_date: str,
        analysts: List[str],
        config_overrides: Dict[str, Any],
    ) -> None:
        self.id: str = uuid.uuid4().hex[:12]
        self.ticker: str = ticker
        self.trade_date: str = trade_date
        self.analysts: List[str] = analysts
        self.config_overrides: Dict[str, Any] = config_overrides
        self.status: str = "queued"  # queued | running | completed | failed | cancelled
        self.created_at: str = _now()
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.error: Optional[str] = None
        self.decision: Optional[str] = None
        self.signal: Optional[str] = None
        self.reports: Dict[str, Optional[str]] = {}
        self.agent_status: Dict[str, str] = {}
        self.events: Deque[Dict[str, Any]] = deque(maxlen=2000)
        self._cancel_flag: bool = False
        self._cond = threading.Condition()

    def to_dict(self, include_events: bool = False) -> Dict[str, Any]:
        data = {
            "id": self.id,
            "ticker": self.ticker,
            "trade_date": self.trade_date,
            "analysts": self.analysts,
            "config_overrides": self.config_overrides,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error": self.error,
            "decision": self.decision,
            "signal": self.signal,
            "reports": self.reports,
            "agent_status": self.agent_status,
        }
        if include_events:
            data["events"] = list(self.events)
        return data

    def append_event(self, event_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        event = {"ts": _now(), "type": event_type, **payload}
        with self._cond:
            self.events.append(event)
            self._cond.notify_all()
        return event

    def request_cancel(self) -> None:
        with self._cond:
            self._cancel_flag = True
            self._cond.notify_all()

    def is_cancelled(self) -> bool:
        return self._cancel_flag

    def wait_for_event(self, last_index: int, timeout: float = 15.0) -> int:
        """Block until ``len(events) > last_index`` or timeout expires."""
        with self._cond:
            if len(self.events) > last_index:
                return len(self.events)
            self._cond.wait(timeout=timeout)
            return len(self.events)


class RunStore:
    """Process-wide run registry."""

    def __init__(self) -> None:
        self._runs: Dict[str, Run] = {}
        self._lock = threading.Lock()
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        for path in sorted(RUNS_DIR.glob("*.json")):
            try:
                data = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            run = Run(
                ticker=data.get("ticker", ""),
                trade_date=data.get("trade_date", ""),
                analysts=data.get("analysts", []),
                config_overrides=data.get("config_overrides", {}),
            )
            run.id = data.get("id", run.id)
            run.status = data.get("status", "completed")
            # Mark any leftover running states as failed (process restarted).
            if run.status in {"queued", "running"}:
                run.status = "failed"
                run.error = run.error or "Interrupted by API restart"
            run.created_at = data.get("created_at", run.created_at)
            run.started_at = data.get("started_at")
            run.finished_at = data.get("finished_at")
            run.error = data.get("error")
            run.decision = data.get("decision")
            run.signal = data.get("signal")
            run.reports = data.get("reports", {})
            run.agent_status = data.get("agent_status", {})
            self._runs[run.id] = run

    def create(
        self,
        ticker: str,
        trade_date: str,
        analysts: List[str],
        config_overrides: Dict[str, Any],
    ) -> Run:
        run = Run(ticker, trade_date, analysts, config_overrides)
        with self._lock:
            self._runs[run.id] = run
        self.persist(run)
        return run

    def get(self, run_id: str) -> Optional[Run]:
        return self._runs.get(run_id)

    def list(self) -> List[Run]:
        return sorted(
            self._runs.values(),
            key=lambda r: r.created_at,
            reverse=True,
        )

    def delete(self, run_id: str) -> bool:
        with self._lock:
            run = self._runs.pop(run_id, None)
        if run is None:
            return False
        path = RUNS_DIR / f"{run_id}.json"
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return True

    def persist(self, run: Run) -> None:
        path = RUNS_DIR / f"{run.id}.json"
        try:
            path.write_text(json.dumps(run.to_dict(include_events=False), indent=2))
        except OSError:
            pass


_store: Optional[RunStore] = None


def get_store() -> RunStore:
    global _store
    if _store is None:
        _store = RunStore()
    return _store
