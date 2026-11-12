"""Read-only proof for the approved shared-navigation presentation recapture.

Runs in the source QA checkout. Never edits approvals, frozen hashes or pages.
Only public review evidence is written to the selected output directory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BASE_SHA = "5a4fa1ff828189ae2d0acbca7de2ad8009891fd3"
APPROVALS = "data/editorial/contract-analysis/approvals.json"
ANALYSIS_ID = "13ec615146b3d348190a9b0b9148831e"
PRESENTATION_FIELDS = {
    "rendered_content_hash_previous", "rendered_content_hash",
    "rendered_hash_recaptured_at", "rendered_hash_recapture_reason",
    "rendered_hash_recapture_reason_previous",
}
WORKER = r'''
import hashlib,json,os,shutil,sys
from pathlib import Path
root=Path.cwd()
os.environ['CONFENGE_CONTRACT_ANALYSIS_ROOT']=str(root)
from scripts.contract_analysis import AUTHORIZED_ANALYSIS_ID,AUTHORIZED_CANONICAL_PATH
from scripts.contract_analysis.consume import load_canary
from scripts.contract_analysis.gate import evaluate_cohort
from scripts.contract_analysis.render import render_analysis_html
from scripts.contract_analysis.approval import find_approval,material_hash,rendered_content_hash
from scripts.pseo.public_artifact import finalize_public_artifact
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
records=load_canary(live_path=root/'scripts/contract_analysis/fixtures/official-live-01')['records']
rec=next(r for r in records if r['id']==AUTHORIZED_ANALYSIS_ID)
decision=evaluate_cohort([rec])[0]
assert decision.state=='PUBLISHABLE_INDEX' and decision.indexable
html=render_analysis_html(rec,decision)
(out/'source.html').write_text(html,encoding='utf-8',newline='\n')
artifact=out/'artifact'
if artifact.exists():shutil.rmtree(artifact)
artifact.mkdir()
page=artifact/AUTHORIZED_CANONICAL_PATH.strip('/')/'index.html'
page.parent.mkdir(parents=True,exist_ok=True)
page.write_text(html,encoding='utf-8',newline='\n')
for name in ('styles.css','styles-tokens.css','styles-tools.css','styles-offers.css'):
 (artifact/name).write_bytes((root/name).read_bytes().replace(b'\r\n',b'\n'))
finalize_public_artifact(artifact)
published=page.read_bytes()
public_hash=hashlib.sha256(published).hexdigest()
assert public_hash==rendered_content_hash(html,record=rec)
(out/'public.html').write_bytes(published)
binding=find_approval(rec)
assert binding and material_hash(rec)==binding['material_hash']
print(json.dumps({'state':decision.state,'canonical_path':AUTHORIZED_CANONICAL_PATH,
 'material_hash':material_hash(rec),'approval':binding,'public_sha256':public_hash,
 'source_sha256':hashlib.sha256(html.encode('utf-8')).hexdigest()}))
'''

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()

def region(source: str, tag: str) -> str:
    matches = re.findall(rf"<{tag}\b[^>]*>.*?</{tag}>", source, re.S)
    assert len(matches) == 1, (tag, len(matches))
    return matches[0]

def shared(source: str, tag: str):
    matches = list(re.finditer(
        rf'<{tag}\b[^>]*\bclass="[^"]*(?<![\w-])site-{tag}(?![\w-])[^"]*"[^>]*>.*?</{tag}>',
        source, re.S))
    assert len(matches) == 1, ("shared", tag, len(matches))
    return matches[0]

def discovery(source: str):
    matches = list(re.finditer(r"<!-- BEGIN NAV DISCOVERY -->.*?<!-- END NAV DISCOVERY -->", source, re.S))
    assert len(matches) == 1, ("discovery", len(matches))
    match = matches[0]
    assert match.group().count('data-nav-discovery="true"') == 1
    assert "<main" not in match.group() and "<header" not in match.group()
    return match

def discovery_content(source: str) -> str:
    block = discovery(source).group()
    start = '<!-- BEGIN NAV DISCOVERY --><nav class="nav-discovery-region" aria-label="Acesso direto">'
    end = '</nav><!-- END NAV DISCOVERY -->'
    if block.startswith(start):
        assert block.endswith(end)
        block = '<!-- BEGIN NAV DISCOVERY -->' + block[len(start):-len(end)] + '<!-- END NAV DISCOVERY -->'
    assert "<nav" not in block and "</nav" not in block
    return block

def external_named_discovery(source: str) -> None:
    bar, header = discovery(source), shared(source, "header")
    assert header.end() <= bar.start() and not source[header.end():bar.start()].strip()
    assert bar.group().startswith('<!-- BEGIN NAV DISCOVERY --><nav class="nav-discovery-region" aria-label="Acesso direto">')
    assert bar.group().endswith('</nav><!-- END NAV DISCOVERY -->')
    discovery_content(source)

def header_without_discovery(source: str) -> str:
    header = re.sub(r"<!-- BEGIN NAV DISCOVERY -->.*?<!-- END NAV DISCOVERY -->", "", shared(source, "header").group(), flags=re.S)
    return re.sub(r"\s*</header>$", "\n</header>", header)

def without_chrome(source: str) -> str:
    bar, header = discovery(source), shared(source, "header")
    inside = header.start() <= bar.start() and bar.end() <= header.end()
    adjacent = header.end() <= bar.start() and not source[header.end():bar.start()].strip()
    assert inside or adjacent
    end = header.end() if inside else bar.end()
    source = source[:header.start()] + "<header>[SHARED PRESENTATION]</header>" + source[end:]
    footer = shared(source, "footer")
    return source[:footer.start()] + "<footer>[SHARED PRESENTATION]</footer>" + source[footer.end():]

def without_fingerprint(source: str) -> str:
    source, count = re.subn(r'(?<=href=")/assets/css/styles\.[a-f0-9]{12}\.css(?=")', "/assets/css/styles.[PRESENTATION FINGERPRINT].css", source)
    assert count == 1, ("shared stylesheet", count)
    return source

def worker(root: Path, output: Path) -> dict:
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)
    value = subprocess.check_output([sys.executable, "-c", WORKER, str(output)], cwd=root, env=env, text=True)
    return json.loads(value)

def approval_state(previous: dict, current: dict, baseline: dict, candidate: dict) -> str:
    assert baseline["material_hash"] == candidate["material_hash"]
    old = baseline["approval"]
    new = candidate["approval"]
    assert {k:v for k,v in old.items() if k not in PRESENTATION_FIELDS} == {k:v for k,v in new.items() if k not in PRESENTATION_FIELDS}
    assert {k:v for k,v in previous.items() if k not in {"approvals","audit"}} == {k:v for k,v in current.items() if k not in {"approvals","audit"}}
    assert len(previous["approvals"]) == len(current["approvals"])
    for before, after in zip(previous["approvals"], current["approvals"]):
        if before.get("analysis_id") == ANALYSIS_ID and not before.get("withdrawn"):
            assert {k:v for k,v in before.items() if k not in PRESENTATION_FIELDS} == {k:v for k,v in after.items() if k not in PRESENTATION_FIELDS}
        else:
            assert before == after
    if previous == current:
        assert old["rendered_content_hash"] == new["rendered_content_hash"]
        return "PENDING_PRESENTATION_RECAPTURE"
    assert new["rendered_content_hash"] == candidate["public_sha256"]
    assert new["rendered_content_hash_previous"] == old["rendered_content_hash"]
    assert current["audit"][:-1] == previous["audit"]
    assert len(current["audit"]) == len(previous["audit"]) + 1
    event = current["audit"][-1]
    assert event["action"] == "recapture_rendered_presentation" and event["actor"] == "CODEX_AGENT_EXECUTOR"
    assert event["analysis_id"] == ANALYSIS_ID
    assert event["rendered_content_hash_previous"] == old["rendered_content_hash"]
    assert event["rendered_content_hash"] == candidate["public_sha256"]
    assert re.fullmatch(r"[a-f0-9]{40}", event["qa_source_head_sha"])
    assert event["qa_workflow_run_id"] and event["qa_workflow_run_attempt"]
    return "RECAPTURED_PRESENTATION_VERIFIED"

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    head = git("rev-parse", "HEAD")
    assert head == os.environ["EXPECTED_HEAD_SHA"]
    assert git("merge-base", "--is-ancestor", BASE_SHA, head) == ""
    dirty = git("diff", "--name-only").splitlines()
    assert set(dirty) <= {"data/commercial/first-fold-contract.v1.json", "data/commercial/first-fold-measurements.v1.json"}, dirty
    current = json.loads((ROOT / APPROVALS).read_text())
    previous = json.loads(subprocess.check_output(["git", "show", f"{BASE_SHA}:{APPROVALS}"], cwd=ROOT, text=True))
    with tempfile.TemporaryDirectory(prefix="navigation-approved-") as temporary:
        baseline_root = Path(temporary) / "baseline"
        baseline_root.mkdir()
        archive = subprocess.Popen(["git", "archive", BASE_SHA], cwd=ROOT, stdout=subprocess.PIPE)
        extracted = subprocess.run(["tar", "-xf", "-", "-C", str(baseline_root)], stdin=archive.stdout)
        archive.stdout.close()
        assert extracted.returncode == 0 and archive.wait() == 0
        baseline = worker(baseline_root, output / "baseline")
        candidate = worker(ROOT, output / "candidate")
        assert baseline["public_sha256"] == baseline["approval"]["rendered_content_hash"]
        state = approval_state(previous, current, baseline, candidate)
        before = (output / "baseline/source.html").read_text()
        after = (output / "candidate/source.html").read_text()
        before_public = (output / "baseline/public.html").read_text()
        after_public = (output / "candidate/public.html").read_text()
        external_named_discovery(after)
        external_named_discovery(after_public)
        checks = {
            "source_main_byte_identical": region(before,"main") == region(after,"main"),
            "source_head_byte_identical": region(before,"head") == region(after,"head"),
            "public_main_byte_identical": region(before_public,"main") == region(after_public,"main"),
            "source_header_unchanged_except_bar": header_without_discovery(before) == header_without_discovery(after),
            "public_header_unchanged_except_bar": header_without_discovery(before_public) == header_without_discovery(after_public),
            "source_footer_byte_identical": shared(before,"footer").group() == shared(after,"footer").group(),
            "public_footer_byte_identical": shared(before_public,"footer").group() == shared(after_public,"footer").group(),
            "source_bar_content_byte_identical": discovery_content(before) == discovery_content(after),
            "public_bar_content_byte_identical": discovery_content(before_public) == discovery_content(after_public),
            "source_outside_shared_navigation_footer_byte_identical": without_chrome(before) == without_chrome(after),
            "public_outside_shared_navigation_footer_css_fingerprint_byte_identical": without_fingerprint(without_chrome(before_public)) == without_fingerprint(without_chrome(after_public)),
        }
        frozen = json.loads((baseline_root / "data/bofu-dominance/frozen-specs/hashes.json").read_text())
        protected = [name for name in frozen["forbidden"] if name not in {"script.js","styles.css"}]
        checks["fifteen_other_protected_files_unchanged"] = len(protected) == 15 and all((ROOT/name).read_bytes() == (baseline_root/name).read_bytes() for name in protected)
        checks["six_source_pillars_unchanged"] = len(frozen["pillars"]) == 6 and all((ROOT/slug/"index.html").read_bytes() == (baseline_root/slug/"index.html").read_bytes() for slug in frozen["pillars"])
        assert all(checks.values()), checks
        report = {
            "schema": "confenge.navigation-presentation-proof/1.0",
            "base_sha": BASE_SHA, "candidate_head_sha": head,
            "candidate_tree_sha": git("rev-parse","HEAD^{tree}"),
            "workflow_run_id": os.environ["GITHUB_RUN_ID"],
            "workflow_run_attempt": os.environ["GITHUB_RUN_ATTEMPT"],
            "checks": checks, "approval_registry_state": state,
            "approval_registry_modified_by_proof": False,
            "canonical_path": candidate["canonical_path"],
            "material_hash": candidate["material_hash"],
            "source_main_sha256": digest(region(after,"main").encode()),
            "public_main_sha256": digest(region(after_public,"main").encode()),
            "source_head_sha256": digest(region(after,"head").encode()),
            "previous_public_sha256": baseline["public_sha256"],
            "candidate_public_sha256": candidate["public_sha256"],
            "candidate_source_sha256": candidate["source_sha256"],
            "script_js_sha256": digest((ROOT/"script.js").read_bytes()),
            "styles_css_sha256": digest((ROOT/"styles.css").read_bytes()),
            "factual_approval_fields_unchanged": True,
            "human_review_claimed": False,
        }
        (output/"evidence.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
        print(json.dumps(report,ensure_ascii=False))

if __name__ == "__main__":
    main()
