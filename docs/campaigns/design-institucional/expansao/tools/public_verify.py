"""Verificação no domínio público após a promoção (SALTO-INSTITUCIONAL-02).

    python3 docs/campaigns/design-institucional/expansao/tools/public_verify.py --expected-sha <sha> --artifact _site \
        --out docs/campaigns/design-institucional/expansao/evidence/public-verification-<sha>.json

Compara identidade (build-info/runtime-info/healthz/ready), rotas críticas (200, canonical, robots
meta, título, hash do HTML vs artefato), assets referenciados (CSS/fontes/imagens/pranchas com
Content-Type correto), robots.txt (política), redirects e sitemaps. Sem cache (cache-buster + no-cache).
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys, time, urllib.request, urllib.error
from pathlib import Path

ROUTES = ["/", "/servicos/", "/quantitativos-orcamento-obras/", "/compatibilizacao-projetos-engenharia/", "/revisao-tecnica-projetos-engenharia/", "/projetos-complementares-engenharia/", "/inspecao-diagnostico-edificacoes/", "/assistencia-tecnica-pericial-engenharia/", "/seguranca-trabalho-apoio-tecnico/", "/servicos-obras-publicas/", "/problemas-que-resolvemos/", "/aditivos-obras-publicas/", "/auditoria-orcamento-licitacao/", "/diagnostico-b2g-360/", "/diagnostico-pre-licitacao/", "/medicoes-glosas-obras-publicas/", "/reequilibrio-obras-publicas/", "/entregas/", "/casos/", "/conteudos/", "/conteudos/documentos-reequilibrio-obra-publica/", "/especialista/tiago-jun-sasaki/", "/triagem-tecnica/", "/parcerias-engenharia/", "/ferramentas/diagnostico-defesa-margem/", "/diretoria-b2g/", "/obrigado", "/404.html"]


def fetch(url: str, *, method: str = "GET", follow: bool = True):
    req = urllib.request.Request(url + ("&" if "?" in url else "?") + f"cb={int(time.time()*1000)}", method=method, headers={"User-Agent": "confenge-public-verify/1.0", "Cache-Control": "no-cache", "Pragma": "no-cache"})
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--base", default="https://confenge.com.br"); ap.add_argument("--expected-sha", required=True); ap.add_argument("--artifact", default="_site"); ap.add_argument("--out", required=True)
    a = ap.parse_args(); base = a.base.rstrip("/"); art = Path(a.artifact)
    rep = {"base": base, "expected_sha": a.expected_sha, "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "identity": {}, "routes": [], "assets": [], "robots": {}, "redirects": [], "problems": []}
    prob = rep["problems"].append
    for ep in ["/.well-known/build-info.json", "/.well-known/runtime-info.json", "/healthz", "/ready"]:
        st, h, body = fetch(base + ep)
        rec = {"status": st, "content_type": h.get("Content-Type")}
        if ep.endswith(".json") and st == 200:
            try:
                j = json.loads(body); rec["commit"] = j.get("commit") or j.get("release_sha"); rec["artifact_hash"] = j.get("artifact_hash") or j.get("public_artifact_hash"); rec["build_time"] = j.get("build_time") or j.get("build_timestamp")
                if rec["commit"] != a.expected_sha: prob(f"{ep}: commit {rec['commit']} != esperado {a.expected_sha}")
            except Exception as e:
                prob(f"{ep}: json inválido {e}")
        elif st != 200:
            prob(f"{ep}: status {st}")
        rep["identity"][ep] = rec
    assets = set()
    for route in ROUTES:
        st, h, body = fetch(base + route)
        html = body.decode("utf-8", "replace")
        local = art / (route.strip("/") + "/index.html" if route.endswith("/") else route.lstrip("/"))
        if route == "/obrigado": local = art / "obrigado.html"
        if route == "/": local = art / "index.html"
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', html); robots = re.search(r'<meta name="robots" content="([^"]+)"', html); title = re.search(r"<title>(.*?)</title>", html, re.S)
        rec = {"route": route, "status": st, "content_type": h.get("Content-Type"), "bytes": len(body), "canonical": canon.group(1) if canon else None, "robots": robots.group(1) if robots else None, "title": (title.group(1).strip() if title else None), "sha256": hashlib.sha256(body).hexdigest(), "matches_artifact": None}
        if local.is_file():
            lb = local.read_bytes(); rec["matches_artifact"] = hashlib.sha256(lb).hexdigest() == rec["sha256"]
            if not rec["matches_artifact"]:
                # tolerar apenas diferenças de fingerprint injetadas pela borda? não: registrar
                prob(f"{route}: HTML servido difere do artefato ({len(body)} vs {len(lb)} bytes)")
        expected_status = 200
        if st != expected_status: prob(f"{route}: status {st}")
        for m in re.finditer(r'(?:href|src|srcset)="(/assets/[^"\s]+|/styles[^"\s]*\.css|/script\.js[^"\s]*)"', html):
            assets.add(m.group(1).split(" ")[0])
        rep["routes"].append(rec)
    exp_ct = {".css": "text/css", ".js": "javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".webmanifest": "manifest"}
    for asset in sorted(assets):
        st, h, body = fetch(base + asset)
        ct = h.get("Content-Type", ""); ext = "." + asset.rsplit(".", 1)[-1].split("?")[0]
        ok = st == 200 and (exp_ct.get(ext, "") in ct)
        rep["assets"].append({"asset": asset, "status": st, "content_type": ct, "bytes": len(body), "ok": ok, "cache_control": h.get("Cache-Control")})
        if not ok: prob(f"asset {asset}: status {st} content-type {ct}")
    st404, h404, b404 = fetch(base + "/rota-inexistente-salto-02/")
    rep["not_found"] = {"status": st404, "carries_state_block": b'class="state' in b404}
    if st404 != 404: prob(f"rota inexistente: status {st404} (esperado 404)")
    st, h, body = fetch(base + "/robots.txt")
    rtxt = body.decode("utf-8", "replace"); local_robots = (art / "robots.txt").read_text(encoding="utf-8") if (art / "robots.txt").is_file() else ""
    rep["robots"] = {"status": st, "sha256": hashlib.sha256(body).hexdigest(), "matches_artifact": rtxt == local_robots, "first_lines": rtxt.splitlines()[:6]}
    if rtxt != local_robots: prob("robots.txt servido difere do artefato")
    for src in ["/obrigado-contrato", "/index.html", "/conteudos/desconto-da-proposta-em-item-novo-aditivo/"]:
        st, h, _ = fetch(base + src, follow=False)
        rep["redirects"].append({"path": src, "status": st, "location": h.get("Location")})
    for sm in ["/sitemap.xml", "/sitemap-editorial.xml"]:
        st, h, body = fetch(base + sm)
        rep.setdefault("sitemaps", []).append({"path": sm, "status": st, "urls": body.count(b"<loc>")})
        if st != 200: prob(f"{sm}: status {st}")
    Path(a.out).write_text(json.dumps(rep, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"identity: {rep['identity']['/.well-known/build-info.json'].get('commit')} | rotas {len(rep['routes'])} | assets {len(rep['assets'])} ok={sum(1 for x in rep['assets'] if x['ok'])} | problemas {len(rep['problems'])}")
    for p in rep["problems"]: print("  -", p)
    return 1 if rep["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
