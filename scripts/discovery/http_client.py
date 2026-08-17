"""Limited public GET/HEAD client for the live technical probe.

This is the only discovery module allowed to open sockets. IndexNow POST
is impossible here: methods other than GET/HEAD are refused before any
request is built.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ALLOWED_METHODS = frozenset({"GET", "HEAD"})
DEFAULT_UA = (
    "CONFENGE-DiscoveryObservatory/1.0 "
    "(+https://confenge.com.br/metodologia-inteligencia/; "
    "read-only technical probe; no ranking request)"
)
DEFAULT_TIMEOUT_S = 15.0
DEFAULT_RETRIES = 2
DEFAULT_RATE_LIMIT_S = 1.0
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class ProbeHttpError(ValueError):
    """GET/HEAD probe transport failed or was asked to mutate."""


@dataclass
class ProbeResponse:
    method: str
    url: str
    status: int | None
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""
    error: str | None = None
    elapsed_ms: int = 0

    @property
    def unavailable(self) -> bool:
        return self.status is None or self.error is not None

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


class Transport:
    """Test seam. Production uses UrllibTransport."""

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout: float,
    ) -> ProbeResponse:
        raise NotImplementedError


class _NoRedirect(HTTPRedirectHandler):
    """Leave 3xx to the caller so the probe can classify the chain."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


_OPENER = build_opener(_NoRedirect)


class UrllibTransport(Transport):
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout: float,
    ) -> ProbeResponse:
        started = time.monotonic()
        req = Request(url, method=method, headers=dict(headers))
        try:
            with _OPENER.open(req, timeout=timeout) as resp:  # GET/HEAD only
                body = b"" if method == "HEAD" else resp.read()
                header_map = {k.lower(): v for k, v in resp.headers.items()}
                elapsed = int((time.monotonic() - started) * 1000)
                return ProbeResponse(
                    method=method,
                    url=getattr(resp, "geturl", lambda: url)(),
                    status=int(getattr(resp, "status", 200) or 200),
                    headers=header_map,
                    body=body,
                    elapsed_ms=elapsed,
                )
        except HTTPError as exc:
            body = b""
            try:
                body = exc.read() if method != "HEAD" else b""
            except Exception:
                body = b""
            header_map = {}
            if exc.headers:
                header_map = {k.lower(): v for k, v in exc.headers.items()}
            elapsed = int((time.monotonic() - started) * 1000)
            return ProbeResponse(
                method=method,
                url=url,
                status=int(exc.code),
                headers=header_map,
                body=body,
                elapsed_ms=elapsed,
            )
        except TimeoutError:
            elapsed = int((time.monotonic() - started) * 1000)
            return ProbeResponse(
                method=method,
                url=url,
                status=None,
                error="timeout",
                elapsed_ms=elapsed,
            )
        except URLError as exc:
            elapsed = int((time.monotonic() - started) * 1000)
            reason = str(getattr(exc, "reason", exc))
            err = "timeout" if "timed out" in reason.lower() else "unavailable"
            return ProbeResponse(
                method=method,
                url=url,
                status=None,
                error=err,
                elapsed_ms=elapsed,
            )


class FakeTransport(Transport):
    """In-memory GET/HEAD map for tests. No sockets."""

    def __init__(
        self,
        responses: dict[tuple[str, str], ProbeResponse | Exception] | None = None,
    ) -> None:
        self.responses = responses or {}
        self.calls: list[tuple[str, str]] = []

    def add(self, method: str, url: str, response: ProbeResponse | Exception) -> None:
        self.responses[(method.upper(), url)] = response

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout: float,
    ) -> ProbeResponse:
        self.calls.append((method, url))
        mapped = self.responses.get((method, url))
        if mapped is None:
            mapped = self.responses.get((method, url.rstrip("/")))
        if mapped is None:
            return ProbeResponse(method=method, url=url, status=None, error="unavailable")
        if isinstance(mapped, Exception):
            if isinstance(mapped, TimeoutError):
                return ProbeResponse(method=method, url=url, status=None, error="timeout")
            return ProbeResponse(method=method, url=url, status=None, error="unavailable")
        return mapped


class RateLimiter:
    def __init__(self, interval_s: float, *, sleeper=time.sleep) -> None:
        self.interval_s = max(0.0, float(interval_s))
        self._sleeper = sleeper
        self._last = 0.0

    def wait(self) -> None:
        if self.interval_s <= 0:
            return
        now = time.monotonic()
        gap = self.interval_s - (now - self._last)
        if gap > 0:
            self._sleeper(gap)
        self._last = time.monotonic()


def assert_safe_method(method: str) -> str:
    token = method.upper().strip()
    if token not in ALLOWED_METHODS:
        raise ProbeHttpError(f"method_not_allowed:{method}")
    return token


def assert_public_http_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ProbeHttpError(f"scheme_not_allowed:{url}")
    if not parsed.netloc:
        raise ProbeHttpError(f"host_required:{url}")
    return url


def request(
    method: str,
    url: str,
    *,
    transport: Transport | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
    retries: int = DEFAULT_RETRIES,
    rate_limiter: RateLimiter | None = None,
    user_agent: str = DEFAULT_UA,
    extra_headers: Mapping[str, str] | None = None,
) -> ProbeResponse:
    """GET or HEAD with timeout, limited retry and a clear user-agent."""
    method = assert_safe_method(method)
    url = assert_public_http_url(url)
    transport = transport or UrllibTransport()
    headers = {"User-Agent": user_agent, "Accept": "*/*"}
    if extra_headers:
        headers.update(extra_headers)
    attempts = 1 + max(0, int(retries))
    last: ProbeResponse | None = None
    for attempt in range(attempts):
        if rate_limiter is not None:
            rate_limiter.wait()
        last = transport.request(method, url, headers=headers, timeout=timeout)
        if last.error == "timeout":
            if attempt + 1 < attempts:
                continue
            return last
        if last.status in RETRYABLE_STATUS and attempt + 1 < attempts:
            continue
        return last
    return last or ProbeResponse(method=method, url=url, status=None, error="unavailable")
