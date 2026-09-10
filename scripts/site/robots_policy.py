#!/usr/bin/env python3
"""Regras efetivas do robots.txt servido, conforme a RFC 9309.

Existe porque a igualdade de bytes NAO e igualdade de politica. O contrato de
borda em ``public_server_acceptance.robots_edge_contract`` prova que a borda nao
mexeu nos nossos bytes; ele nao prova que os nossos bytes continuam exprimindo a
politica vigente. Uma restricao pode desaparecer do arquivo sem que um unico byte
seja adulterado no caminho, e o gate de bytes aprovaria.

Este modulo avalia o corpo REALMENTE servido -- inclusive a parcela gerenciada
que o Cloudflare antepoe -- e responde, por agente e por caminho, se o rastreio e
permitido. Com isso e possivel reprovar, antes de promover, a perda de uma
restricao que hoje esta em producao.

RFC 9309 implementada aqui:
  2.2.1  grupos com o mesmo user-agent sao COMBINADOS num unico grupo;
         o grupo escolhido e o de token mais especifico, com "*" como recurso.
  2.2.2  vence a regra de caminho mais especifica (mais longa); em empate entre
         allow e disallow vence a MENOS restritiva, isto e, allow.
  2.2.3  "*" casa qualquer sequencia e "$" ancora o fim do caminho.
Uma linha ``Disallow:`` sem valor nao restringe nada.

Diretivas nao padronizadas (Sitemap, Content-Signal, Crawl-delay, ...) nao
controlam allow/disallow, mas exprimem politica vigente e por isso sao
preservadas e comparadas -- nao sao descartaveis so porque a RFC nao as define.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable

__all__ = [
    "ParsedRobots",
    "parse_robots",
    "is_allowed",
    "evaluate_probes",
    "policy_regression",
    "withdrawn_prefixes_from_redirects",
    "indexable_prefixes_from_headers",
]

_PATH_RULES = ("allow", "disallow")
# Diretivas que nao controlam rastreio mas exprimem politica vigente.
_POLICY_DIRECTIVES = ("sitemap", "content-signal", "crawl-delay", "noai", "noimageai")


class ParsedRobots:
    """Grupos combinados por user-agent mais as diretivas de politica."""

    def __init__(
        self,
        groups: dict[str, list[tuple[str, str]]],
        policy: dict[str, list[str]],
        group_policy: dict[str, dict[str, list[str]]],
    ) -> None:
        self.groups = groups
        self.policy = policy
        self.group_policy = group_policy

    def agents(self) -> list[str]:
        return sorted(self.groups)

    def as_dict(self) -> dict[str, Any]:
        return {
            "groups": {a: [list(r) for r in rules] for a, rules in sorted(self.groups.items())},
            "policy": {k: sorted(v) for k, v in sorted(self.policy.items())},
            "group_policy": {
                a: {k: sorted(v) for k, v in sorted(d.items())}
                for a, d in sorted(self.group_policy.items())
            },
        }


def _decode(body: bytes | str) -> str:
    if isinstance(body, str):
        return body
    # A RFC manda tratar o arquivo como UTF-8 e ignorar bytes invalidos em vez de
    # descartar o arquivo inteiro.
    return body.decode("utf-8", errors="replace")


def parse_robots(body: bytes | str) -> ParsedRobots:
    """Le o corpo e combina os grupos com o mesmo user-agent (RFC 9309 2.2.1)."""
    groups: dict[str, list[tuple[str, str]]] = {}
    policy: dict[str, list[str]] = {}
    group_policy: dict[str, dict[str, list[str]]] = {}
    # user-agents do grupo corrente; None enquanto nenhum grupo foi aberto.
    current: list[str] = []
    # Uma linha de regra fecha a sequencia de user-agents: os proximos
    # "User-agent:" abrem um grupo novo.
    accepting_agents = False

    for raw in _decode(body).splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        field, _, value = line.partition(":")
        field = field.strip().lower()
        value = value.strip()

        if field == "user-agent":
            if not accepting_agents:
                current = []
                accepting_agents = True
            token = value.lower()
            if token:
                current.append(token)
                groups.setdefault(token, [])
            continue

        if field in _PATH_RULES:
            accepting_agents = False
            if not current:
                # Regra fora de qualquer grupo: a RFC manda ignorar.
                continue
            for token in current:
                groups[token].append((field, value))
            continue

        if field in _POLICY_DIRECTIVES:
            # Sitemap e global; as demais pertencem ao grupo corrente quando ha um.
            if field == "sitemap" or not current:
                policy.setdefault(field, []).append(value)
            else:
                accepting_agents = False
                for token in current:
                    group_policy.setdefault(token, {}).setdefault(field, []).append(value)
            continue

        # Diretiva desconhecida: preservada como politica, nunca descartada em bloco.
        policy.setdefault(field, []).append(value)

    return ParsedRobots(groups, policy, group_policy)


def _select_group(parsed: ParsedRobots, agent: str) -> list[tuple[str, str]] | None:
    """Grupo aplicavel: token mais especifico que casa, senao "*"."""
    name = agent.lower()
    best: str | None = None
    for token in parsed.groups:
        if token == "*":
            continue
        # RFC 9309 2.2.1: o produto casa por prefixo, sem diferenciar caixa.
        if name.startswith(token) and (best is None or len(token) > len(best)):
            best = token
    if best is not None:
        return parsed.groups[best]
    return parsed.groups.get("*")


# RFC 3986 6.2.2.2: um octeto do conjunto "unreserved" escrito em percent-encoding
# e equivalente ao caractere. Sem normalizar, "/%6Fps/" nao casa com
# "Disallow: /ops/" e um rastreador que peca a forma codificada passa por cima da
# restricao. So o conjunto unreserved e decodificado: "%2A" continua sendo "%2A" e
# nao vira o curinga "*", entao normalizar nao cria casamento onde nao havia.
_UNRESERVED = re.compile(r"%([0-9A-Fa-f]{2})")


def _normalize_path(value: str) -> str:
    def decode(match: re.Match[str]) -> str:
        char = chr(int(match.group(1), 16))
        return char if (char.isascii() and (char.isalnum() or char in "-._~")) else match.group(0)

    return _UNRESERVED.sub(decode, value)


def _rule_to_regex(pattern: str) -> re.Pattern[str]:
    out = []
    for ch in pattern:
        if ch == "*":
            out.append(".*")
        elif ch == "$":
            out.append("$")
        else:
            out.append(re.escape(ch))
    return re.compile("".join(out))


def _match_length(pattern: str, path: str) -> int | None:
    """Comprimento do casamento, ou None. O "$" ancora o fim (RFC 9309 2.2.3).

    Regra e caminho sao normalizados antes de comparar, para que a forma
    percent-encoded de um caractere unreserved nao escape da restricao.
    """
    if not pattern:
        return None
    match = _rule_to_regex(_normalize_path(pattern)).match(_normalize_path(path))
    if match is None:
        return None
    # A especificidade e o tamanho da REGRA, nao do trecho casado.
    return len(pattern)


def is_allowed(parsed: ParsedRobots, agent: str, path: str) -> tuple[bool, str]:
    """Decide (permitido, regra vencedora) para um agente e um caminho."""
    rules = _select_group(parsed, agent)
    if not rules:
        return True, "no_group"

    winner: tuple[int, str, str] | None = None
    for kind, pattern in rules:
        if kind == "disallow" and not pattern:
            # "Disallow:" vazio nao restringe nada.
            continue
        length = _match_length(pattern, path)
        if length is None:
            continue
        if winner is None or length > winner[0]:
            winner = (length, kind, pattern)
        elif length == winner[0] and kind == "allow":
            # 2.2.2: empate resolve pela regra MENOS restritiva.
            winner = (length, kind, pattern)

    if winner is None:
        return True, "no_matching_rule"
    return winner[1] == "allow", f"{winner[1]}:{winner[2]}"


def evaluate_probes(
    body: bytes | str, probes: Iterable[dict[str, str]]
) -> list[dict[str, Any]]:
    """Aplica uma lista de sondas {agent, path} ao corpo dado."""
    parsed = parse_robots(body)
    out = []
    for probe in probes:
        agent = probe["agent"]
        path = probe["path"]
        allowed, rule = is_allowed(parsed, agent, path)
        out.append({"agent": agent, "path": path, "allowed": allowed, "rule": rule})
    return out


def policy_regression(
    *,
    served: bytes | str,
    candidate: bytes | str,
    probes: Iterable[dict[str, str]],
    withdrawn_prefixes: Iterable[str] = (),
    indexable_prefixes: Iterable[str] = (),
) -> dict[str, Any]:
    """Reprova quando o candidato PERDE uma restricao que hoje esta em producao.

    Uma restricao so pode sair do robots.txt por um de dois motivos, e ambos tem
    de estar provados pelo PROPRIO pacote -- nunca por uma excecao escrita a mao:

    ``withdrawn_prefixes``  a URL foi retirada com 410. Ai um ``Disallow`` seria
        mais fraco, nao mais forte: impediria o rastreador de VER o 410 e de
        remover a URL do indice. Derivado do ``_redirects`` do pacote.

    ``indexable_prefixes``  a rota passou a ser publicada com ``index, follow``
        no ``_headers`` do pacote. Ai o ``Allow`` nao e relaxamento: e a condicao
        para que a decisao de indexar tenha qualquer efeito, porque uma rota
        bloqueada no robots nunca chega a ser lida. Derivado do ``_headers``.

    Qualquer outra passagem de bloqueado para permitido e perda de restricao
    vigente e reprova. As duas dispensas sao lidas do pacote candidato, de modo
    que aprovar uma exige mudar a decisao publicada, nao afrouxar o teste.
    """
    served_rows = {(r["agent"], r["path"]): r for r in evaluate_probes(served, probes)}
    candidate_rows = {(r["agent"], r["path"]): r for r in evaluate_probes(candidate, probes)}
    prefixes = tuple(withdrawn_prefixes)
    indexable = tuple(indexable_prefixes)

    losses = []
    authorized = []
    for key, before in served_rows.items():
        after = candidate_rows[key]
        if before["allowed"] or not after["allowed"]:
            continue
        path = key[1]
        row = {
            "agent": key[0],
            "path": path,
            "served_rule": before["rule"],
            "candidate_rule": after["rule"],
        }
        if any(path.startswith(prefix) for prefix in prefixes):
            authorized.append({**row, "because": "withdrawn_410"})
            continue
        if any(path.startswith(prefix) for prefix in indexable):
            authorized.append({**row, "because": "published_index_follow"})
            continue
        losses.append(row)

    served_policy = parse_robots(served)
    candidate_policy = parse_robots(candidate)
    dropped_policy = []
    for field, values in served_policy.policy.items():
        kept = set(candidate_policy.policy.get(field, []))
        for value in values:
            if value not in kept:
                dropped_policy.append({"directive": field, "value": value})
    for agent, directives in served_policy.group_policy.items():
        kept_agent = candidate_policy.group_policy.get(agent, {})
        for field, values in directives.items():
            kept = set(kept_agent.get(field, []))
            for value in values:
                if value not in kept:
                    dropped_policy.append({"directive": field, "value": value, "agent": agent})

    return {
        "schema": "confenge.robots-policy-regression/v1",
        "probes": len(served_rows),
        "withdrawn_prefixes": list(prefixes),
        "indexable_prefixes": list(indexable),
        "lost_restrictions": losses,
        "authorized_relaxations": authorized,
        "dropped_policy_directives": dropped_policy,
        "ok": not losses and not dropped_policy,
    }


def indexable_prefixes_from_headers(headers: Path | str) -> list[str]:
    """Rotas publicadas com ``index, follow`` no ``_headers`` do pacote.

    Uma rota so entra aqui quando a decisao de indexar esta escrita no pacote.
    Enquanto o ``X-Robots-Tag`` disser ``noindex``, nenhum ``Allow`` novo no
    robots.txt e considerado autorizado.
    """
    path = Path(headers)
    text = path.read_text(encoding="utf-8") if path.is_file() else str(headers)
    out: set[str] = set()
    current: list[str] = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            current = []
            continue
        if not line[:1].isspace():
            if line.strip().startswith("/"):
                current.append(line.strip())
            else:
                current = []
            continue
        field, _, value = line.strip().partition(":")
        if field.strip().lower() != "x-robots-tag":
            continue
        directives = {d.strip().lower() for d in value.split(",")}
        if "noindex" in directives or "index" not in directives:
            continue
        for pattern in current:
            out.add(pattern[:-1] if pattern.endswith("*") else pattern)
    return sorted(out)


def withdrawn_prefixes_from_redirects(redirects: Path | str) -> list[str]:
    """Prefixos retirados com 410, lidos do ``_redirects`` do proprio pacote."""
    text = Path(redirects).read_text(encoding="utf-8") if Path(redirects).is_file() else str(redirects)
    out: set[str] = set()
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line.endswith("410"):
            continue
        parts = line.split()
        if len(parts) < 3:
            continue
        source = parts[0]
        if source.endswith("/*"):
            out.add(source[:-1])
        elif source.endswith("*"):
            out.add(source[:-1])
        else:
            out.add(source.rstrip("/") + "/")
            out.add(source)
    return sorted(out)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--served", type=Path, required=True, help="corpo servido hoje")
    parser.add_argument("--candidate", type=Path, required=True, help="robots.txt do pacote")
    parser.add_argument("--probes", type=Path, required=True, help="json com {agent,path}")
    parser.add_argument("--redirects", type=Path, help="_redirects do pacote, para as retiradas 410")
    parser.add_argument("--headers", type=Path, help="_headers do pacote, para as rotas index,follow")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)

    probes = json.loads(args.probes.read_text(encoding="utf-8"))
    report = policy_regression(
        served=args.served.read_bytes(),
        candidate=args.candidate.read_bytes(),
        probes=probes,
        withdrawn_prefixes=withdrawn_prefixes_from_redirects(args.redirects) if args.redirects else (),
        indexable_prefixes=indexable_prefixes_from_headers(args.headers) if args.headers else (),
    )
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())


def derive_expected_effective(baseline: dict[str, Any]) -> list[dict[str, Any]]:
    """Deriva a tabela esperada das DECLARACOES de politica, nunca do corpo.

    Se a expectativa for gerada a partir da resposta que se quer validar, o gate
    vira tautologia: um defeito no pacote produz uma linha de base que concorda
    com o defeito. Aqui a decisao sai apenas de tres declaracoes do proprio
    arquivo de politica, na ordem em que a politica as enuncia:

    1. um rastreador de IA nomeado e negado em TODO caminho;
    2. uma superficie privada declarada e negada a QUALQUER agente;
    3. o restante e rastreavel, porque a politica publica e ``Allow: /``.

    Uma URL retirada com 410 e uma rota publicada com ``index, follow`` caem na
    regra 3 de proposito, e por motivos opostos: sobre a retirada, bloquear
    impediria o rastreador de ver o 410; sobre a publicada, bloquear impediria a
    decisao de indexar de ter qualquer efeito.
    """
    ai = {a.lower() for a in baseline.get("ai_crawlers_denied_everywhere", [])}
    # Normalizado dos dois lados: a politica declara "/ops/" uma vez e vale
    # tambem para "/%6Fps/", em vez de exigir que alguem lembre de listar cada
    # codificacao possivel.
    private = tuple(
        _normalize_path(p) for p in baseline.get("private_surfaces_denied_to_every_agent", [])
    )
    rows = []
    for row in baseline.get("expected_effective", []):
        agent, path = row["agent"], row["path"]
        normalized = _normalize_path(path)
        if agent.lower() in ai:
            allowed = False
        elif any(normalized.startswith(prefix) for prefix in private):
            allowed = False
        else:
            allowed = True
        rows.append({"agent": agent, "path": path, "allowed": allowed})
    return rows
