"""Structured (JSON) logging + per-request correlation IDs.

Before this, every `logger.exception()`/`logger.error()` call already
scattered across the app (orchestrator.py, meal_vision.py, resolution.py,
...) had nowhere configured to go - no `logging.basicConfig()` anywhere
meant they all fell through to Python's bare "handler of last resort"
(unformatted, no timestamp, no way to tell which request caused which
error). `configure_logging()` gives the root logger a real JSON handler, and
`RequestIdMiddleware` attaches a request ID to every log line emitted while
handling a request - via a ContextVar, not a parameter threaded through every
function call - so an error logged three stack frames deep inside a Claude
tool-use loop can still be traced back to the exact request that caused it.
"""

import json
import logging
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())
    handler.addFilter(_RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


class RequestIdMiddleware(BaseHTTPMiddleware):
    _logger = logging.getLogger("app.access")

    async def dispatch(self, request, call_next):
        incoming = request.headers.get("x-request-id")
        request_id = incoming or str(uuid.uuid4())
        token = request_id_var.set(request_id)
        started = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.monotonic() - started) * 1000, 1)
            self._logger.exception(
                "%s %s -> unhandled exception (%.1fms)", request.method, request.url.path, duration_ms
            )
            raise
        else:
            duration_ms = round((time.monotonic() - started) * 1000, 1)
            self._logger.info(
                "%s %s -> %s (%.1fms)", request.method, request.url.path, response.status_code, duration_ms
            )
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            request_id_var.reset(token)
