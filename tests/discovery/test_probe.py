"""Drive the shipped probe: GET/HEAD only, fixture transports, append-only hash."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.discovery.http_client import (
    DEFAULT_UA,
    FakeTransport,
    ProbeHttpError,
    ProbeResponse,
    assert_safe_method,
    request,
)
from scripts.discovery.inspect import path_blocked_by_robots, robots_disallows
from scripts.discovery.observation import (
    REASON_CANONICAL_DIVERGENT,
    REASON_HTTP_429,
    REASON_HTTP_5XX,
    REASON_HTTP_TIMEOUT,
    REASON_ROBOTS_BLOCKING,
    REASON_SITEMAP_ABSENT,
    REASON_TECHNICAL_LIVE,
    REASON_UNEXPECTED_EXTERNAL_REDIRECT,
    compute_record_hash,
)
from scripts.discovery.probe import classify_redirect, probe_asset
from scripts.discovery.store import append_observation

CANONICAL = "https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
ASSET = {"id": "valor-tipico-contratos-pavimentacao", "canonical": CANONICAL}
AS_OF = "2026-08-17T18:25:58Z"
HTML = """<!doctype html><html><head>
<title>Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina? | CONFENGE</title>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"/>
<script type="application/ld+json">{"@type":"Dataset","name":"Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina?","description":"ticket contratual típico de pavimentação em Santa Catarina","url":"https://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"}</script>
</head><body><main>
<h1>Qual é o valor típico dos contratos públicos de pavimentação em Santa Catarina?</h1>
<a href="/inteligencia/">Inteligência</a>
</main></body></html>"""
ROBOTS = "User-agent: *\nAllow: /\nSitemap: https://confenge.com.br/sitemap-inteligencia.xml\n"
SITEMAP = (
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    f"<url><loc>{CANONICAL}</loc></url></urlset>"
)
EMPTY_SITEMAP = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
FIXTURES = ROOT / "tests" / "discovery" / "fixtures"
LIVE_EDGE_ROBOTS = (FIXTURES / "robots-live-edge.txt").read_text(encoding="utf-8")
ADVERSARIAL_ROBOTS = (FIXTURES / "robots-adversarial-groups.txt").read_text(encoding="utf-8")
FAILED_LIVE_PATHS = (
    "/ferramentas/diagnostico-defesa-margem/",
    "/metodologia-inteligencia/",
    "/especialista/tiago-jun-sasaki/",
    "/defesa-margem-contratos-publicos/",
    "/radar/nacional-obras-publicas/",
)


def _ok(method: str, url: str, body: bytes = b"", status: int = 200, headers: dict | None = None) -> ProbeResponse:
    return ProbeResponse(method=method, url=url, status=status, headers=headers or {}, body=body)


def baseline_transport(
    overrides: dict[tuple[str, str], ProbeResponse | Exception] | None = None,
) -> FakeTransport:
    mapping: dict[tuple[str, str], ProbeResponse | Exception] = {
        ("GET", CANONICAL): _ok("GET", CANONICAL, HTML.encode(), headers={"etag": "w1", "last-modified": "Mon, 17 Aug 2026 18:00:00 GMT"}),
        ("HEAD", CANONICAL): _ok("HEAD", CANONICAL, b"", headers={"etag": "w1"}),
        ("GET", "https://confenge.com.br/robots.txt"): _ok("GET", "https://confenge.com.br/robots.txt", ROBOTS.encode()),
        ("GET", "https://confenge.com.br/sitemap.xml"): _ok("GET", "https://confenge.com.br/sitemap.xml", EMPTY_SITEMAP.encode()),
        ("GET", "https://confenge.com.br/sitemap-editorial.xml"): _ok(
            "GET", "https://confenge.com.br/sitemap-editorial.xml", EMPTY_SITEMAP.encode()
        ),
        ("GET", "https://confenge.com.br/sitemap-inteligencia.xml"): _ok(
            "GET", "https://confenge.com.br/sitemap-inteligencia.xml", SITEMAP.encode()
        ),
        ("GET", "https://confenge.com.br/sitemap-jurisprudencia.xml"): _ok(
            "GET", "https://confenge.com.br/sitemap-jurisprudencia.xml", EMPTY_SITEMAP.encode()
        ),
    }
    if overrides:
        mapping.update(overrides)
    transport = FakeTransport()
    for (method, url), response in mapping.items():
        transport.add(method, url, response)
    return transport


def run_probe(transport: FakeTransport, **kwargs):
    return probe_asset(
        ASSET,
        observed_at=AS_OF,
        transport=transport,
        timeout=2.0,
        retries=1,
        rate_limit_s=0.0,
        **kwargs,
    )


def test_probe_refuses_non_get_head():
    with pytest.raises(ProbeHttpError, match="method_not_allowed"):
        assert_safe_method("POST")
    with pytest.raises(ProbeHttpError, match="method_not_allowed"):
        request("DELETE", CANONICAL, transport=FakeTransport(), timeout=1, retries=0)


def test_valid_canonical_and_same_site_redirect():
    transport = baseline_transport()
    http_url = "http://confenge.com.br/inteligencia/valor-tipico-contratos-pavimentacao/"
    transport.add(
        "GET",
        http_url,
        _ok("GET", http_url, b"", status=301, headers={"location": CANONICAL}),
    )
    assert classify_redirect(http_url, CANONICAL) == "http_to_https"
    result = run_probe(transport)
    assert result["status"] == "observed"
    assert result["technical_status"] == "TECHNICAL_LIVE"
    assert result["declared_canonical"] == CANONICAL
    assert result["http"]["status"] == 200
    assert result["sitemap"]["present"] is True
    assert result["indexability"]["state"] == "indexable"
    assert result["content_hash"]
    assert REASON_TECHNICAL_LIVE in result["reason_codes"]
    assert DEFAULT_UA
    assert result["limits"]["methods"] == ["GET", "HEAD"]
    assert any(call[0] in {"GET", "HEAD"} for call in transport.calls)
    assert all(call[0] in {"GET", "HEAD"} for call in transport.calls)


def test_unexpected_external_redirect_is_alert():
    transport = baseline_transport(
        {
            ("GET", CANONICAL): _ok(
                "GET",
                CANONICAL,
                b"",
                status=302,
                headers={"location": "https://evil.example/phish"},
            )
        }
    )
    result = run_probe(transport)
    assert REASON_UNEXPECTED_EXTERNAL_REDIRECT in result["reason_codes"]
    assert result["http"]["chain"][0]["classification"] == "unexpected_external"
    assert result["technical_status"] in {"UNKNOWN", "UNAVAILABLE"}


def test_robots_blocking():
    robots = "User-agent: *\nDisallow: /inteligencia/\n"
    transport = baseline_transport(
        {
            ("GET", "https://confenge.com.br/robots.txt"): _ok(
                "GET", "https://confenge.com.br/robots.txt", robots.encode()
            )
        }
    )
    result = run_probe(transport)
    assert result["robots"]["blocked"] is True
    assert REASON_ROBOTS_BLOCKING in result["reason_codes"]
    assert result["technical_status"] != "TECHNICAL_LIVE"


@pytest.mark.parametrize("path", FAILED_LIVE_PATHS)
def test_live_edge_named_groups_do_not_block_observatory_ua(path):
    assert path_blocked_by_robots(path, LIVE_EDGE_ROBOTS, user_agent=DEFAULT_UA) is False


def test_probe_uses_ua_aware_live_edge_rules():
    transport = baseline_transport(
        {
            ("GET", "https://confenge.com.br/robots.txt"): _ok(
                "GET", "https://confenge.com.br/robots.txt", LIVE_EDGE_ROBOTS.encode()
            )
        }
    )
    result = run_probe(transport)
    assert result["robots"]["blocked"] is False
    assert REASON_ROBOTS_BLOCKING not in result["reason_codes"]
    assert result["technical_status"] == "TECHNICAL_LIVE"


def test_robots_group_selection_multiple_tokens_and_named_specificity():
    assert path_blocked_by_robots(
        "/named/article", ADVERSARIAL_ROBOTS, user_agent="Googlebot-News/1.0"
    ) is True
    assert path_blocked_by_robots(
        "/named/exception", ADVERSARIAL_ROBOTS, user_agent="Googlebot-News/1.0"
    ) is False
    assert path_blocked_by_robots(
        "/named/exception/child", ADVERSARIAL_ROBOTS, user_agent="Googlebot-News/1.0"
    ) is True
    assert path_blocked_by_robots(
        "/generic-only/report", ADVERSARIAL_ROBOTS, user_agent="Googlebot-News/1.0"
    ) is False
    assert path_blocked_by_robots(
        "/second-news-group/report", ADVERSARIAL_ROBOTS, user_agent="Googlebot-News/1.0"
    ) is True
    assert path_blocked_by_robots(
        "/versioned-agent/report", ADVERSARIAL_ROBOTS, user_agent="Googlebot/2.1"
    ) is True
    assert path_blocked_by_robots(
        "/star-agent/report", ADVERSARIAL_ROBOTS, user_agent="Googlebot/2.1"
    ) is True
    assert path_blocked_by_robots(
        "/anything", ADVERSARIAL_ROBOTS, user_agent="GPTBot/1.0"
    ) is True
    assert path_blocked_by_robots(
        "/anything", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is False


def test_robots_wildcards_empty_disallow_and_allow_precedence():
    assert path_blocked_by_robots(
        "/private/report", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/private/public/report", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is False
    assert path_blocked_by_robots(
        "/same", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is False
    assert path_blocked_by_robots(
        "/page.htm", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/x", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/foo/bar/baz", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/foo/bar?baz=https://foo.bar", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/params;blocked", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/filename.php", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    assert path_blocked_by_robots(
        "/filename.php?parameters", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is False
    assert path_blocked_by_robots(
        "/report?id=123", ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA
    ) is True
    trailing_wildcard = "User-agent: *\nAllow: /\nDisallow: /*\n"
    assert path_blocked_by_robots("/", trailing_wildcard, user_agent=DEFAULT_UA) is True
    assert robots_disallows(ADVERSARIAL_ROBOTS, user_agent=DEFAULT_UA) == [
        "/private/*",
        "/same",
        "/*.htm",
        "/x$",
        "/foo/bar/%62%61%7A",
        "/foo/bar?baz=https%3A%2F%2Ffoo.bar",
        "/params%3Bblocked",
        "/*.php$",
        "/*?id=",
    ]


def test_divergent_canonical():
    html = HTML.replace(CANONICAL, "https://confenge.com.br/outra-pagina/")
    transport = baseline_transport({("GET", CANONICAL): _ok("GET", CANONICAL, html.encode())})
    result = run_probe(transport)
    assert REASON_CANONICAL_DIVERGENT in result["reason_codes"]


def test_sitemap_absent():
    transport = baseline_transport(
        {
            ("GET", "https://confenge.com.br/sitemap-inteligencia.xml"): _ok(
                "GET", "https://confenge.com.br/sitemap-inteligencia.xml", EMPTY_SITEMAP.encode()
            )
        }
    )
    result = run_probe(transport)
    assert result["sitemap"]["present"] is False
    assert REASON_SITEMAP_ABSENT in result["reason_codes"]


def test_timeout_429_and_5xx():
    timeout_t = FakeTransport()
    timeout_t.add("GET", CANONICAL, TimeoutError("timed out"))
    timeout_t.add("HEAD", CANONICAL, TimeoutError("timed out"))
    timeout_t.add(
        "GET",
        "https://confenge.com.br/robots.txt",
        TimeoutError("timed out"),
    )
    timed = run_probe(timeout_t)
    assert timed["status"] in {"UNKNOWN", "UNAVAILABLE"}
    assert REASON_HTTP_TIMEOUT in timed["reason_codes"]

    t429 = baseline_transport({("GET", CANONICAL): _ok("GET", CANONICAL, b"", status=429)})
    r429 = run_probe(t429)
    assert REASON_HTTP_429 in r429["reason_codes"]

    t5 = baseline_transport({("GET", CANONICAL): _ok("GET", CANONICAL, b"err", status=503)})
    r5 = run_probe(t5)
    assert REASON_HTTP_5XX in r5["reason_codes"]


def test_content_hash_stable_and_changed():
    first = run_probe(baseline_transport())
    second = run_probe(baseline_transport())
    assert first["content_hash"] == second["content_hash"]
    changed_html = HTML.replace("Santa Catarina", "Santa Catarina (atualizado)")
    changed = run_probe(
        baseline_transport({("GET", CANONICAL): _ok("GET", CANONICAL, changed_html.encode())})
    )
    assert changed["content_hash"] != first["content_hash"]


def test_append_only_replay_does_not_duplicate(tmp_path):
    store = tmp_path / "observations.ndjson"
    first = run_probe(baseline_transport())
    a = append_observation(store, first)
    b = append_observation(store, first)
    assert a["appended"] is True
    assert b["appended"] is False
    assert b["replay"] is True
    assert a["record_hash"] == b["record_hash"] == compute_record_hash(first)
    lines = [line for line in store.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 1
