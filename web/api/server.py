"""Entry point for running the API with ``python -m web.api.server``."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.getenv("TRADINGAGENTS_WEB_HOST", "127.0.0.1")
    port = int(os.getenv("TRADINGAGENTS_WEB_PORT", "8765"))
    uvicorn.run("web.api.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
