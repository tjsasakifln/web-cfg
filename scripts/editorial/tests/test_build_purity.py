"""The build must be pure: no destructive git call, no drift between two runs.

Three guarantees are asserted here, all of them regressions this repository has
actually shipped:

1. No build or gate script may run a git subcommand that discards work in the
   checkout. A build that silently reverts a tracked file destroys whatever a
   developer had in the tree and makes a green CI meaningless.
2. Running the editorial build twice from the same tree must leave the deploy
   surface byte-identical. Anything else means the committed artifact depends on
   how many times someone happened to run the build.
3. The committed sitemap graph must equal what the build would generate. The
   check compares and reports a readable diff; it never writes, and it never
   puts anything back.
"""

from __future__ import annotations

import ast
import difflib
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.sitemap_graph import graph_drift, plan_graph  # noqa: E402

# git subcommands that can destroy uncommitted work in the checkout.
DESTRUCTIVE_GIT_SUBCOMMANDS = frozenset(
    {"checkout", "restore", "reset", "clean", "stash", "rm"}
)

# Directories that hold build, render and gate code. Documentation and
# changelogs may quote a git command; executable code may not run one.
CODE_ROOTS = ("scripts", "seo/scripts", "deploy", "netlify", "tools", ".github")

SKIP_DIR_NAMES = frozenset(
    {"node_modules", "__pycache__", ".git", "build", "dist", ".worktrees", ".claude"}
)

# The public deploy surface: everything a visitor or a crawler can fetch and
# that the build is allowed to write.
DEPLOY_SURFACE_SUFFIXES = (".html", ".xml")
DEPLOY_SURFACE_NAMES = frozenset(
    {"sitemap.txt", "robots.txt", "_redirects", "_headers", "content-index.json"}
)

# Audit artifacts carry a wall-clock stamp by design. They are allowed to differ
# between two runs, but only in those declared timestamp fields.
AUDIT_ARTIFACTS = {
    "data/editorial/EDITORIAL-REGISTRY.json": ("generated_at",),
    "docs/editorial/EDITORIAL-REGISTRY.json": ("generated_at",),
    "seo/editorial-build-report.json": ("generated_at",),
    ".well-known/editorial-review-packet.json": ("preview_generated_at",),
}


def _iter_code_files():
    for rel_root in CODE_ROOTS:
        base = ROOT / rel_root
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            if path.suffix in {".py", ".mjs", ".cjs", ".js", ".ts", ".sh", ".yml", ".yaml"}:
                yield path


def _destructive_git_calls_in_python(path: Path) -> list[str]:
    """Report ["git", "checkout", ...] style argument lists in Python source."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return []
    found: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.List, ast.Tuple)):
            continue
        literals = [
            el.value
            for el in node.elts
            if isinstance(el, ast.Constant) and isinstance(el.value, str)
        ]
        if len(literals) < 2 or literals[0] != "git":
            continue
        if literals[1] in DESTRUCTIVE_GIT_SUBCOMMANDS:
            # `git checkout -b <branch>` creates a branch and touches nothing
            # that is already in the tree.
            if literals[1] == "checkout" and "-b" in literals[2:3]:
                continue
            found.append(f"{path.relative_to(ROOT)}:{node.lineno}: {literals}")
    return found


def _destructive_git_calls_in_text(path: Path) -> list[str]:
    """Report shell-style `git checkout ...` in scripts and workflow files."""
    found: list[str] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("#") or stripped.startswith("//"):
            continue
        for sub in DESTRUCTIVE_GIT_SUBCOMMANDS:
            needle = f"git {sub}"
            if needle not in stripped:
                continue
            if sub == "checkout" and f"{needle} -b" in stripped:
                continue
            found.append(f"{path.relative_to(ROOT)}:{lineno}: {stripped[:120]}")
    return found


def test_no_build_or_gate_script_discards_work_with_git() -> None:
    offenders: list[str] = []
    for path in _iter_code_files():
        if path.suffix == ".py":
            offenders.extend(_destructive_git_calls_in_python(path))
        else:
            offenders.extend(_destructive_git_calls_in_text(path))
    package_json = ROOT / "package.json"
    scripts = json.loads(package_json.read_text(encoding="utf-8")).get("scripts") or {}
    for name, command in scripts.items():
        for sub in DESTRUCTIVE_GIT_SUBCOMMANDS:
            if f"git {sub}" in command and f"git {sub} -b" not in command:
                offenders.append(f"package.json:scripts.{name}: {command[:120]}")
    assert not offenders, (
        "build/gate code discards work in the checkout with git:\n  "
        + "\n  ".join(offenders)
        + "\nA build must never revert a tracked file. Compare and fail instead."
    )
    print("OK test_no_build_or_gate_script_discards_work_with_git")


def _deploy_surface_digest() -> dict[str, str]:
    digest: dict[str, str] = {}
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in path.relative_to(ROOT).parts):
            continue
        if path.name not in DEPLOY_SURFACE_NAMES and path.suffix not in DEPLOY_SURFACE_SUFFIXES:
            continue
        rel = str(path.relative_to(ROOT))
        digest[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest


def _audit_artifact_snapshot() -> dict[str, str]:
    """Audit files with their declared timestamp fields blanked out."""
    snapshot: dict[str, str] = {}
    for rel, stamp_fields in AUDIT_ARTIFACTS.items():
        path = ROOT / rel
        if not path.is_file():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        for field in stamp_fields:
            payload.pop(field, None)
        snapshot[rel] = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return snapshot


def _run_editorial_build() -> None:
    proc = subprocess.run(
        [sys.executable, "scripts/editorial/build.py"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, f"editorial build failed: {proc.stderr[-2000:]}"


def test_running_the_build_twice_produces_identical_output() -> None:
    _run_editorial_build()
    first_surface = _deploy_surface_digest()
    first_audit = _audit_artifact_snapshot()

    _run_editorial_build()
    second_surface = _deploy_surface_digest()
    second_audit = _audit_artifact_snapshot()

    changed = sorted(
        rel
        for rel in set(first_surface) | set(second_surface)
        if first_surface.get(rel) != second_surface.get(rel)
    )
    assert not changed, (
        "the build is not reproducible; a second run changed the deploy surface:\n  "
        + "\n  ".join(changed)
    )

    drifted = sorted(rel for rel in first_audit if first_audit[rel] != second_audit.get(rel))
    assert not drifted, (
        "audit artifacts differ between two runs beyond their declared timestamp "
        "fields; the build is accumulating state:\n  " + "\n  ".join(drifted)
    )
    print("OK test_running_the_build_twice_produces_identical_output")


def test_committed_sitemap_graph_equals_the_generated_graph() -> None:
    drift = graph_drift(ROOT)
    assert not drift, (
        "the committed sitemap graph is not what the build generates. Run "
        "`npm run editorial:build` and commit the result; never restore the old "
        "bytes.\n\n" + "\n".join(drift.values())
    )
    print("OK test_committed_sitemap_graph_equals_the_generated_graph")


def test_public_graph_matches_its_reviewed_baseline_with_a_readable_diff() -> None:
    """The build writes the graph; a baseline it cannot write decides if that is ok.

    data/bofu-dominance/frozen-specs/hashes.json is a reviewed, committed
    baseline that no build step writes, so this comparison stays meaningful even
    when the gates run right after a build. On drift the failure carries the
    unified diff between the baseline bytes and the generated ones - the fix is
    a reviewed recapture committed with the change, never a restore.
    """
    baseline_path = ROOT / "data/bofu-dominance/frozen-specs/hashes.json"
    payload = json.loads(baseline_path.read_text(encoding="utf-8"))
    baseline_commit = payload["baseline_commit"]
    graph_files = ("sitemap.xml", "sitemap-index.xml", "sitemap.txt", "robots.txt")

    problems: list[str] = []
    for rel in graph_files:
        live_bytes = (ROOT / rel).read_bytes()
        expected = payload["forbidden"][rel]
        if hashlib.sha256(live_bytes).hexdigest() == expected:
            continue
        baseline_bytes = subprocess.run(
            ["git", "-C", str(ROOT), "show", f"{baseline_commit}:{rel}"],
            capture_output=True,
            check=False,
        )
        diff = ""
        if baseline_bytes.returncode == 0:
            diff = "".join(
                difflib.unified_diff(
                    baseline_bytes.stdout.decode("utf-8").splitlines(keepends=True),
                    live_bytes.decode("utf-8").splitlines(keepends=True),
                    fromfile=f"baseline/{rel}",
                    tofile=f"generated/{rel}",
                    n=2,
                )
            )
        problems.append(f"{rel}: baseline {expected[:12]} != generated\n{diff}")

    assert not problems, (
        "the generated public graph no longer matches its reviewed baseline:\n"
        + "\n".join(problems)
        + "\nCommit a reviewed recapture in data/bofu-dominance/frozen-specs/"
        "hashes.json. Never restore the old bytes from git during a build."
    )
    print("OK test_public_graph_matches_its_reviewed_baseline_with_a_readable_diff")


def test_planning_the_graph_never_writes_to_the_tree() -> None:
    before = {
        name: (ROOT / name).read_bytes()
        for name in plan_graph(ROOT)
        if (ROOT / name).is_file()
    }
    plan_graph(ROOT)
    after = {name: (ROOT / name).read_bytes() for name in before}
    assert before == after, "plan_graph mutated the checkout; it must only compare"
    print("OK test_planning_the_graph_never_writes_to_the_tree")


if __name__ == "__main__":
    test_no_build_or_gate_script_discards_work_with_git()
    test_running_the_build_twice_produces_identical_output()
    test_committed_sitemap_graph_equals_the_generated_graph()
    test_public_graph_matches_its_reviewed_baseline_with_a_readable_diff()
    test_planning_the_graph_never_writes_to_the_tree()
