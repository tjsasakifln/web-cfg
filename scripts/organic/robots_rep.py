"""Shared Googlebot Robots Exclusion Protocol resolver for sitemap and discovery checks.

The search audit resolves the crawler's group and the effective matching rule;
this module reads policy only and never rewrites robots.txt.
"""

from __future__ import annotations

import re


RobotsRule = tuple[str, str]
RobotsGroup = tuple[tuple[str, ...], tuple[RobotsRule, ...]]
_ROBOTS_UNRESERVED = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
)
_ROBOTS_RESERVED = frozenset(":/?#[]@!$&'()*+,;=")


def _normalize_robots_agent(value: str) -> str:
    token = value.strip().lower()
    if token == "*":
        return token
    # Google ignores version suffixes and wildcard suffixes on product tokens.
    match = re.match(r"[a-z_-]+", token)
    return match.group(0) if match else ""


def _robots_groups(robots_text: str) -> list[RobotsGroup]:
    """Parse REP groups while ignoring extensions such as Sitemap/Content-Signal."""
    groups: list[RobotsGroup] = []
    agents: list[str] = []
    rules: list[RobotsRule] = []
    has_rule_line = False

    def finish_group() -> None:
        nonlocal agents, rules, has_rule_line
        if agents:
            groups.append((tuple(agents), tuple(rules)))
        agents = []
        rules = []
        has_rule_line = False

    for raw_line in robots_text.splitlines():
        stripped = raw_line.split("#", 1)[0].strip()
        if not stripped or ":" not in stripped:
            continue
        field, raw_value = stripped.split(":", 1)
        field = field.strip().lower()
        value = raw_value.strip()
        if field == "user-agent":
            if agents and has_rule_line:
                finish_group()
            agent = _normalize_robots_agent(value)
            if agent:
                agents.append(agent)
            continue
        if field not in {"allow", "disallow"} or not agents:
            continue
        has_rule_line = True
        # RFC 9309 empty patterns match nothing, so they carry no policy.
        if value:
            rules.append((field, value))
    finish_group()
    return groups


def applicable_robots_rules(robots_text: str, user_agent: str) -> list[RobotsRule]:
    """Select and combine the most-specific matching REP user-agent groups."""
    normalized_ua = (user_agent or "*").lower()
    matched: list[tuple[int, tuple[RobotsRule, ...]]] = []
    wildcard: list[tuple[RobotsRule, ...]] = []
    for agents, rules in _robots_groups(robots_text):
        if "*" in agents:
            wildcard.append(rules)
        specificities = [
            len(agent)
            for agent in agents
            if agent != "*" and agent in normalized_ua
        ]
        if specificities:
            matched.append((max(specificities), rules))

    selected: list[tuple[RobotsRule, ...]]
    if matched:
        most_specific = max(specificity for specificity, _ in matched)
        selected = [rules for specificity, rules in matched if specificity == most_specific]
    else:
        selected = wildcard

    combined: list[RobotsRule] = []
    seen: set[RobotsRule] = set()
    for rules in selected:
        for rule in rules:
            if rule not in seen:
                seen.add(rule)
                combined.append(rule)
    return combined


def robots_disallows(robots_text: str, *, user_agent: str = "*") -> list[str]:
    """Return effective non-empty Disallow patterns for one crawler user agent."""
    return [
        pattern
        for directive, pattern in applicable_robots_rules(robots_text, user_agent)
        if directive == "disallow"
    ]


def _robots_pattern_matches(path: str, pattern: str) -> bool:
    anchored_at_end = pattern.endswith("$")
    body = pattern[:-1] if anchored_at_end else pattern
    expression = "^" + re.escape(body).replace(r"\*", ".*")
    if anchored_at_end:
        expression += "$"
    return re.match(expression, path) is not None


def _robots_pattern_specificity(pattern: str) -> int:
    # Google's mainstream resolver uses the full rule-path length, including
    # wildcard and end-anchor syntax, before applying Allow on an exact tie.
    return len(pattern.encode("utf-8"))


def _normalize_robots_octets(value: str, *, pattern: bool) -> str:
    """Normalize REP comparison octets without turning encoded * or $ into syntax."""
    normalized: list[str] = []
    index = 0
    in_query = False
    while index < len(value):
        char = value[index]
        if char == "%" and index + 2 < len(value):
            pair = value[index + 1 : index + 3]
            if re.fullmatch(r"[0-9a-fA-F]{2}", pair):
                byte = int(pair, 16)
                decoded = chr(byte)
                if decoded in _ROBOTS_UNRESERVED:
                    normalized.append(decoded)
                else:
                    normalized.append(f"%{byte:02X}")
                index += 3
                continue
        if char == "?" and not in_query:
            normalized.append(char)
            in_query = True
        elif char == "/" and not in_query:
            normalized.append(char)
        elif in_query and char in {"&", "="}:
            normalized.append(char)
        elif pattern and char in {"*", "$"}:
            normalized.append(char)
        elif ord(char) > 0x7F:
            normalized.extend(f"%{byte:02X}" for byte in char.encode("utf-8"))
        elif char in _ROBOTS_RESERVED:
            normalized.append(f"%{ord(char):02X}")
        else:
            normalized.append(char)
        index += 1
    return "".join(normalized)


def path_blocked_by_robots(path: str, robots_text: str, *, user_agent: str = "*") -> bool:
    """Evaluate Allow/Disallow for a UA using REP/Google longest-match behavior."""
    if not path.startswith("/"):
        path = "/" + path
    normalized_path = _normalize_robots_octets(path, pattern=False)
    matches = [
        (directive, _normalize_robots_octets(pattern, pattern=True))
        for directive, pattern in applicable_robots_rules(robots_text, user_agent)
        if _robots_pattern_matches(
            normalized_path, _normalize_robots_octets(pattern, pattern=True)
        )
    ]
    if not matches:
        return False
    longest = max(_robots_pattern_specificity(pattern) for _, pattern in matches)
    winners = [
        directive
        for directive, pattern in matches
        if _robots_pattern_specificity(pattern) == longest
    ]
    # Equivalent Allow and Disallow rules resolve to Allow.
    return "allow" not in winners
