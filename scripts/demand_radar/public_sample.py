"""The public GSC demand sample served under `/radar/nacional-obras-publicas/`.

The published JSON used to stamp every row with a single `date` equal to the
export date. That is false in a way a reader cannot detect: each row is an
aggregate over the whole window the export covers, not a measurement taken on
one day. This module derives the provenance envelope from the authorized
founder export instead of trusting what was typed into the artifact, so the
window, the denominator and the row grain are recomputed rather than restated.

Two properties are enforced by :func:`check`:

1. The published envelope equals what the export actually says. A recomputed
   window or denominator that no longer matches the file fails, so the artifact
   cannot silently drift away from its own source the way the withdrawn PDF did.
2. The page cannot offer a download the repository is unable to verify. The
   HTML download row is checked against the files on disk, and against the set
   of formats a gate in this repository can actually read. There is no PDF text
   extractor in `requirements-ci.txt`, so a re-added PDF fails closed instead of
   shipping unverified.

The saved filter label in the export (`Últimos 3 meses`) is deliberately kept
in the envelope *next to* the window that was really delivered. Reporting the
label as the window would overstate the coverage by an order of magnitude.
"""

from __future__ import annotations

import csv
import datetime as _dt
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

EXPORT_ID = "seo/gsc-2026-07-30"
EXPORT_DIR = ROOT / "seo" / "gsc-2026-07-30"
PUBLIC_DIR = ROOT / "radar" / "nacional-obras-publicas"
SAMPLE_PATH = PUBLIC_DIR / "gsc-demand-sample.json"
PAGE_PATH = PUBLIC_DIR / "index.html"

SCHEMA = "confenge.radar.gsc_sample.v2"
PROPERTY = "confenge.com.br"

#: The date the founder pulled the export, read off the export id rather than
#: copied from the artifact. Echoing the artifact's own `as_of` back at it would
#: let a wrong export date reproduce itself through every regeneration.
EXPORT_DATE = EXPORT_ID.rsplit("gsc-", 1)[-1]

#: Fixed, not echoed, for the same reason: a warning the artifact could quietly
#: soften is not a warning.
ATTRIBUTION_WARNING = (
    "Search Console aggregate only. Not joinable to individual leads."
)

#: Suffixes a gate in this repository can read back and check for staleness.
#: A format that is not on this list cannot be offered as a download, because
#: nothing here would notice when its content stopped matching the page.
VERIFIABLE_DOWNLOAD_SUFFIXES = frozenset({".json", ".csv", ".txt", ".md"})

_DOWNLOAD_HREF = re.compile(
    r'href="(/radar/nacional-obras-publicas/[^"#?]+\.[a-z0-9]{1,5})"',
    re.IGNORECASE,
)


class PublicSampleError(ValueError):
    """The published sample cannot be derived from the authorized export."""


@dataclass(frozen=True)
class ObservedWindow:
    """What the export actually delivered, not what its filter claims."""

    start: str
    end: str
    days: int
    clicks: int
    impressions: int

    @property
    def ctr(self) -> float:
        if not self.impressions:
            return 0.0
        return round(self.clicks / self.impressions, 6)


def _rows(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise PublicSampleError(f"export_file_missing:{path}")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [row for row in csv.DictReader(handle) if any(v for v in row.values())]


def _int(value: str, code: str) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise PublicSampleError(f"{code}:{value!r}") from exc


def observed_window(export_dir: Path = EXPORT_DIR) -> ObservedWindow:
    """Recompute the window and the property denominator from `Grafico.csv`.

    `Grafico.csv` is the only file in the export with a date dimension, so it
    is the only file that can say which days were actually observed. The
    denominator is the whole property over those days -- every other table in
    the export is a slice of it.
    """
    rows = _rows(export_dir / "Grafico.csv")
    if not rows:
        raise PublicSampleError("export_daily_series_empty")
    dates: list[_dt.date] = []
    clicks = impressions = 0
    for row in rows:
        raw = (row.get("Data") or "").strip()
        try:
            dates.append(_dt.date.fromisoformat(raw))
        except ValueError as exc:
            raise PublicSampleError(f"export_daily_date_invalid:{raw!r}") from exc
        clicks += _int(row.get("Cliques", ""), "export_daily_clicks_invalid")
        impressions += _int(row.get("Impressões", ""), "export_daily_impressions_invalid")
    if len(set(dates)) != len(dates):
        raise PublicSampleError("export_daily_series_has_duplicate_dates")
    return ObservedWindow(
        start=min(dates).isoformat(),
        end=max(dates).isoformat(),
        days=len(dates),
        clicks=clicks,
        impressions=impressions,
    )


def saved_filter_label(export_dir: Path = EXPORT_DIR) -> str:
    """The date filter the founder saved in Search Console, verbatim.

    Kept because it disagrees with the delivered series. Hiding the
    disagreement would make the artifact look more coherent than it is.
    """
    for row in _rows(export_dir / "Filtros.csv"):
        if (row.get("Filtro") or "").strip() == "Data":
            return (row.get("Valor") or "").strip()
    raise PublicSampleError("export_date_filter_missing")


def dimension_totals(export_dir: Path = EXPORT_DIR) -> dict[str, dict[str, int]]:
    """Per-dimension sums, which do not reconcile with each other by design.

    Search Console counts and anonymizes each dimension separately: the pages
    table can sum above the property total and the queries table sums far below
    it. Publishing these lets a reader see why adding rows across tables does
    not rebuild the denominator.
    """
    totals: dict[str, dict[str, int]] = {}
    for key, filename, label in (
        ("pages", "Paginas.csv", "Páginas principais"),
        ("queries", "Consultas.csv", "Top consultas"),
    ):
        rows = _rows(export_dir / filename)
        totals[key] = {
            "rows": len(rows),
            "clicks": sum(_int(r["Cliques"], f"{key}_clicks_invalid") for r in rows),
            "impressions": sum(
                _int(r["Impressões"], f"{key}_impressions_invalid") for r in rows
            ),
        }
        if rows and label not in rows[0]:
            raise PublicSampleError(f"export_{key}_label_missing")
    return totals


def normalize_sample(
    sample: dict[str, Any],
    window: ObservedWindow,
    *,
    filter_label: str,
    totals: dict[str, dict[str, int]],
) -> dict[str, Any]:
    """Rebuild the artifact's envelope from the export, keeping curated rows.

    The row payload (clustering, offer mapping, intent) is editorial judgement
    that no CSV carries, so it is preserved verbatim. Everything that describes
    *when* and *out of what* the numbers were observed is regenerated, and the
    per-row `date` is dropped: an aggregate of a 15-day window is not a daily
    observation and must not be shaped like one.
    """
    rows = sample.get("top_queries")
    if not isinstance(rows, list) or not rows:
        raise PublicSampleError("sample_rows_missing")
    normalized_rows = []
    for row in rows:
        if not isinstance(row, dict):
            raise PublicSampleError("sample_row_not_object")
        rebuilt = {"period_start": window.start, "period_end": window.end}
        for key, value in row.items():
            if key in ("date", "period_start", "period_end"):
                continue
            rebuilt[key] = value
        normalized_rows.append(rebuilt)
    if EXPORT_DATE < window.end:
        # An export cannot report days that had not happened when it was pulled.
        raise PublicSampleError(
            f"export_date_before_observed_window_end:{EXPORT_DATE}<{window.end}"
        )
    return {
        "schema": SCHEMA,
        "as_of": EXPORT_DATE,
        "source": EXPORT_ID,
        "property": PROPERTY,
        "observed_period": {
            "start": window.start,
            "end": window.end,
            "days_with_data": window.days,
            "derived_from": f"{EXPORT_ID}/Grafico.csv",
            "saved_filter_label_in_export": filter_label,
            "filter_label_is_not_the_window": (
                "O filtro salvo no export diz "
                f"«{filter_label}», mas a série diária entregue cobre "
                f"{window.days} dias. A janela válida é a das linhas diárias."
            ),
        },
        "property_totals_in_period": {
            "clicks": window.clicks,
            "impressions": window.impressions,
            "ctr": window.ctr,
            "note": (
                "Denominador do domínio inteiro na janela observada. Cada linha "
                "de top_queries é uma fatia deste total."
            ),
        },
        "dimension_totals_in_export": {
            **totals,
            "note": (
                "O Search Console conta e censura cada dimensão separadamente: a "
                "soma da tabela de páginas fica acima do total do domínio e a de "
                "consultas fica muito abaixo. Somar linhas de dimensões "
                "diferentes não reconstrói o denominador."
            ),
        },
        "row_grain": (
            "Cada linha é um agregado da janela inteira, não uma observação "
            "diária. Por isso as linhas trazem period_start/period_end e não date."
        ),
        "refresh": (
            "Sem cadência automática. O arquivo muda quando um novo export do "
            "Search Console é revisado e publicado."
        ),
        "attribution_warning": ATTRIBUTION_WARNING,
        "top_queries": normalized_rows,
    }


def render(sample: dict[str, Any], **kwargs: Any) -> str:
    return json.dumps(sample, ensure_ascii=False, indent=2, allow_nan=False, **kwargs) + "\n"


def build(root: Path = ROOT) -> str:
    export_dir = root / "seo" / "gsc-2026-07-30"
    path = root / "radar" / "nacional-obras-publicas" / "gsc-demand-sample.json"
    current = json.loads(path.read_text(encoding="utf-8"))
    return render(
        normalize_sample(
            current,
            observed_window(export_dir),
            filter_label=saved_filter_label(export_dir),
            totals=dimension_totals(export_dir),
        )
    )


def download_hrefs(html: str) -> list[str]:
    return _DOWNLOAD_HREF.findall(html)


def check(root: Path = ROOT) -> list[str]:
    """Return every way the published radar artifacts contradict their source.

    An empty list is the only passing result.
    """
    problems: list[str] = []
    export_dir = root / "seo" / "gsc-2026-07-30"
    public_dir = root / "radar" / "nacional-obras-publicas"
    sample_path = public_dir / "gsc-demand-sample.json"
    page_path = public_dir / "index.html"

    try:
        window = observed_window(export_dir)
    except PublicSampleError as exc:
        return [f"export unreadable: {exc}"]

    try:
        raw = sample_path.read_text(encoding="utf-8")
        current = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        return [f"published sample unreadable: {exc}"]

    if current.get("schema") != SCHEMA:
        problems.append(
            f"sample schema is {current.get('schema')!r}, expected {SCHEMA!r}"
        )
    if current.get("as_of") != EXPORT_DATE:
        problems.append(
            f"sample as_of is {current.get('as_of')!r}, but {EXPORT_ID} was pulled "
            f"on {EXPORT_DATE}"
        )
    if current.get("attribution_warning") != ATTRIBUTION_WARNING:
        problems.append("the Search Console attribution warning was altered or dropped")
    for index, row in enumerate(current.get("top_queries") or []):
        if isinstance(row, dict) and "date" in row:
            problems.append(
                f"top_queries[{index}] carries a per-row 'date': a {window.days}-day "
                "aggregate is published as a single-day observation"
            )
            break

    try:
        expected = build(root)
    except PublicSampleError as exc:
        problems.append(f"sample cannot be derived from {EXPORT_ID}: {exc}")
    else:
        if raw != expected:
            problems.append(
                f"{sample_path.name} is not what {EXPORT_ID} says: regenerate it "
                "(scripts.demand_radar.public_sample.build)"
            )

    try:
        html = page_path.read_text(encoding="utf-8")
    except OSError as exc:
        return problems + [f"radar page unreadable: {exc}"]

    for token, what in (
        (window.start, "observed window start"),
        (window.end, "observed window end"),
        (str(window.impressions), "property impressions denominator"),
        (str(window.clicks), "property clicks denominator"),
    ):
        if token not in html:
            problems.append(f"radar page never states the {what} ({token})")

    for href in download_hrefs(html):
        target = root / href.lstrip("/")
        if not target.is_file():
            problems.append(f"page offers a download that is not in the repo: {href}")
            continue
        if target.suffix.lower() not in sorted(VERIFIABLE_DOWNLOAD_SUFFIXES):
            problems.append(
                f"page offers {href}, whose format no gate in this repository can "
                "read back; it would go stale unnoticed the way radar-nacional.pdf did"
            )
    return problems
