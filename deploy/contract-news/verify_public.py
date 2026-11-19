#!/usr/bin/env python3
"""Verify the live news archive and one actual article without private access."""
from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from zoneinfo import ZoneInfo

PREFIX = "/noticias/contratos-publicos/"
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9", "n": "http://www.google.com/schemas/sitemap-news/0.9"}


class VerificationError(ValueError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise VerificationError("unexpected_redirect")


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.canonical = []
        self.robots = []
        self.scripts = []
        self.capture = False
        self.buffer = ""
        self.h1 = 0
        self.headlines = []
        self.paragraphs = []
        self.times = []
        self.links = []
        self.body = {}
        self._heading = None
        self._paragraph = None
        self._time = None
        self._script = False
        self._style = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "link" and values.get("rel") == "canonical":
            self.canonical.append(values.get("href"))
        if tag == "meta" and values.get("name") == "robots":
            self.robots.append(values.get("content", ""))
        if tag == "h1":
            self.h1 += 1
            self._heading = ""
        if tag == "p":
            self._paragraph = ""
        if tag == "time":
            self._time = [values.get("datetime", ""), ""]
        if tag == "a":
            self.links.append(values.get("href", ""))
        if tag == "body":
            self.body = values
        if tag == "style":
            self._style = True
        if tag == "script":
            self._script = True
        if tag == "script" and values.get("type") == "application/ld+json":
            self.capture = True
            self.buffer = ""

    def handle_data(self, data):
        if self.capture:
            self.buffer += data
        if self._script or self._style:
            return
        if self._heading is not None:
            self._heading += data
        if self._paragraph is not None:
            self._paragraph += data
        if self._time is not None:
            self._time[1] += data

    def handle_endtag(self, tag):
        if tag == "script" and self.capture:
            try:
                self.scripts.append(json.loads(self.buffer))
            except ValueError:
                raise VerificationError("invalid_structured_json") from None
            self.capture = False
        if tag == "script":
            self._script = False
        if tag == "style":
            self._style = False
        if tag == "h1" and self._heading is not None:
            self.headlines.append(self._heading)
            self._heading = None
        if tag == "p" and self._paragraph is not None:
            self.paragraphs.append(self._paragraph)
            self._paragraph = None
        if tag == "time" and self._time is not None:
            self.times.append(tuple(self._time))
            self._time = None


def fetch(url: str) -> tuple[str, str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "CONFENGE-Contract-News-Verification/1.0", "Accept": "text/html,application/xml,text/plain", "Cache-Control": "no-cache"})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
        if response.status != 200:
            raise VerificationError("public_status_not_200")
        raw = response.read(32 * 1024 * 1024 + 1)
        if len(raw) > 32 * 1024 * 1024:
            raise VerificationError("public_response_too_large")
        return raw.decode("utf-8"), response.headers.get_content_type(), response.headers.get("X-Robots-Tag", "")


def normalized(value: str) -> str:
    return " ".join(value.split())


def instant(value) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value):
        raise VerificationError("invalid_public_timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise VerificationError("invalid_public_timestamp") from None
    return parsed.astimezone(timezone.utc)


def is_noindex(*values: str) -> bool:
    return any(re.search(r"\b(?:noindex|none)\b", value, re.IGNORECASE) for value in values)


def parse_page(html: str, url: str) -> ArticleParser:
    parser = ArticleParser()
    parser.feed(html)
    if parser.canonical != [url] or parser.h1 != 1 or len(parser.headlines) != 1 or not normalized(parser.headlines[0]) or not parser.robots:
        raise VerificationError("page_identity_invalid")
    if parser.body.get("data-route-family") != "noticias-contratos-publicos" or parser.body.get("data-asset-family") != "editorial":
        raise VerificationError("page_family_invalid")
    return parser


def visible_timestamp(parser: ArticleParser, value: str) -> bool:
    months = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro")
    local = instant(value).astimezone(ZoneInfo("America/Sao_Paulo"))
    date = f"{local.day} de {months[local.month - 1]} de {local.year}"
    return any(datetime_value == value and date in normalized(text) and local.strftime("%H:%M") in text
               for datetime_value, text in parser.times)


def article_metadata(html: str, url: str, *, robots_header: str = "", now: datetime | None = None) -> dict:
    parser = parse_page(html, url)
    if is_noindex(*parser.robots, robots_header):
        raise VerificationError("article_indexability_invalid")
    graphs = [node for data in parser.scripts for node in (data.get("@graph", [data]) if isinstance(data, dict) else [])]
    news = [node for node in graphs if isinstance(node, dict) and node.get("@type") == "NewsArticle"]
    if len(news) != 1:
        raise VerificationError("newsarticle_missing_or_duplicate")
    data = news[0]
    author = data.get("author")
    if (not isinstance(author, dict) or author.get("name") != "CONFENGE" or author.get("@type") != "Organization"
            or data.get("url") != url or data.get("mainEntityOfPage") != url
            or not re.fullmatch(r"https://pncp\.gov\.br/app/contratos/[0-9]{14}/[0-9]{4}/[1-9][0-9]*", data.get("citation", ""))):
        raise VerificationError("article_provenance_invalid")
    if not isinstance(data.get("headline"), str) or normalized(data["headline"]) != normalized(parser.headlines[0]):
        raise VerificationError("article_headline_not_visible")
    body = data.get("articleBody")
    visible = {normalized(paragraph) for paragraph in parser.paragraphs}
    if not isinstance(body, str) or not body.strip() or any(normalized(paragraph) not in visible for paragraph in body.split("\n\n")):
        raise VerificationError("article_body_not_visible")
    if data["citation"] not in parser.links:
        raise VerificationError("article_source_link_not_visible")
    try:
        published = instant(data["datePublished"])
        modified = instant(data["dateModified"])
        if modified < published or modified > (now or datetime.now(timezone.utc)):
            raise ValueError
    except (ValueError, KeyError, TypeError):
        raise VerificationError("article_publication_dates_invalid") from None
    if not visible_timestamp(parser, data["datePublished"]) or not visible_timestamp(parser, data["dateModified"]):
        raise VerificationError("article_dates_not_visible")
    return {"url": url, "source": data["citation"], "published_at": data["datePublished"], "modified_at": data["dateModified"], "headline": data["headline"]}


def canonical_article_url(value: str, base: str) -> bool:
    parsed = urlsplit(value)
    return bool(parsed.scheme == "https" and parsed.netloc == "confenge.com.br" and not parsed.query and not parsed.fragment
                and re.fullmatch(re.escape(PREFIX) + r"[a-z0-9]+(?:-[a-z0-9]+)*/", parsed.path)
                and value.startswith(base + PREFIX))


def verify(base: str, *, now: datetime | None = None) -> dict:
    if base != "https://confenge.com.br":
        raise VerificationError("unexpected_public_origin")
    now = now or datetime.now(timezone.utc)
    robots, _, _ = fetch(base + "/robots.txt")
    if not re.search(r"(?im)^Sitemap:\s*" + re.escape(base + PREFIX + "sitemap.xml") + r"\s*$", robots):
        raise VerificationError("archive_not_discovered")
    index, content_type, index_robots = fetch(base + PREFIX)
    if content_type != "text/html":
        raise VerificationError("index_content_type_invalid")
    index_page = parse_page(index, base + PREFIX)
    raw, content_type, _ = fetch(base + PREFIX + "sitemap.xml")
    if content_type not in {"application/xml", "text/xml"}:
        raise VerificationError("sitemap_content_type_invalid")
    archive = ET.fromstring(raw)
    if archive.tag != "{" + NS["s"] + "}urlset":
        raise VerificationError("archive_sitemap_invalid")
    urls = [row.text or "" for row in archive.findall("s:url/s:loc", NS)]
    if len(urls) > 50000 or len(urls) != len(set(urls)) or any(url != base + PREFIX and not canonical_article_url(url, base) for url in urls):
        raise VerificationError("archive_urls_invalid")
    raw_news, news_type, _ = fetch(base + PREFIX + "news-sitemap.xml")
    news = ET.fromstring(raw_news)
    if news_type not in {"application/xml", "text/xml"} or news.tag != "{" + NS["s"] + "}urlset":
        raise VerificationError("recent_news_sitemap_invalid")
    news_urls = [row.text or "" for row in news.findall("s:url/s:loc", NS)]
    if (len(news_urls) > 1000 or len(news_urls) != len(set(news_urls)) or not set(news_urls).issubset(set(urls))
            or any(not canonical_article_url(url, base) for url in news_urls)):
        raise VerificationError("recent_news_sitemap_invalid")
    recent_metadata = {}
    for row in news.findall("s:url", NS):
        metadata = row.findall("n:news", NS)
        if len(metadata) != 1:
            raise VerificationError("recent_news_metadata_invalid")
        data = metadata[0]
        date = data.findtext("n:publication_date", "", NS)
        published = instant(date)
        title = data.findtext("n:title", "", NS)
        if (published > now or published < now - timedelta(hours=48) or not title.strip()
                or data.findtext("n:publication/n:name", "", NS) != "CONFENGE"
                or data.findtext("n:publication/n:language", "", NS) != "pt"):
            raise VerificationError("recent_news_metadata_invalid")
        recent_metadata[row.findtext("s:loc", "", NS)] = {"date": date, "title": title}
    feed, feed_type, _ = fetch(base + PREFIX + "feed.xml")
    rss = ET.fromstring(feed)
    if feed_type not in {"application/rss+xml", "application/xml", "text/xml"} or rss.tag != "rss":
        raise VerificationError("news_feed_invalid")
    if len(rss.findall("channel")) != 1 or rss.findtext("./channel/link", "") != base + PREFIX or rss.findtext("./channel/language", "") != "pt-BR":
        raise VerificationError("news_feed_channel_invalid")
    feed_metadata = {}
    for item in rss.findall("./channel/item"):
        link = item.findtext("link", "")
        try:
            date = parsedate_to_datetime(item.findtext("pubDate", ""))
            if date.tzinfo is None or date > now:
                raise ValueError
        except (ValueError, TypeError):
            raise VerificationError("news_feed_dates_invalid") from None
        if link in feed_metadata or link not in urls or not canonical_article_url(link, base) or item.findtext("guid", "") != link:
            raise VerificationError("news_feed_urls_invalid")
        feed_metadata[link] = {"date": date, "title": item.findtext("title", "")}
    articles = [url for url in urls if url != base + PREFIX]
    result = {"status": "verified", "article_urls": len(articles), "recent_news_urls": len(news_urls), "verified_article": None}
    if articles:
        if is_noindex(*index_page.robots, index_robots) or base + PREFIX not in urls or articles[0] not in {urljoin(base, link) for link in index_page.links}:
            raise VerificationError("archive_indexability_or_link_invalid")
        html, content_type, article_robots = fetch(articles[0])
        if content_type != "text/html":
            raise VerificationError("article_content_type_invalid")
        checked = article_metadata(html, articles[0], robots_header=article_robots, now=now)
        result["verified_article"] = checked
        matching = next(row for row in archive.findall("s:url", NS) if row.findtext("s:loc", "", NS) == articles[0])
        if instant(matching.findtext("s:lastmod", "", NS)) != instant(checked["modified_at"]):
            raise VerificationError("archive_lastmod_mismatch")
        recent = recent_metadata.get(articles[0])
        if instant(checked["published_at"]) >= now - timedelta(hours=48):
            if not recent or instant(recent["date"]) != instant(checked["published_at"]) or recent["title"] != checked["headline"]:
                raise VerificationError("recent_news_article_mismatch")
        feed_item = feed_metadata.get(articles[0])
        if not feed_item or feed_item["date"] != instant(checked["published_at"]) or feed_item["title"] != checked["headline"]:
            raise VerificationError("feed_article_mismatch")
    else:
        if not is_noindex(*index_page.robots) or news_urls or feed_metadata or any(canonical_article_url(urljoin(base, url), base) for url in index_page.links):
            raise VerificationError("empty_archive_must_be_noindex")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="https://confenge.com.br")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.base), sort_keys=True))
        return 0
    except (VerificationError, OSError, ValueError, ET.ParseError, urllib.error.URLError) as exc:
        code = str(exc) if isinstance(exc, VerificationError) else "public_verification_failed"
        print(json.dumps({"status": "error", "code": code}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
