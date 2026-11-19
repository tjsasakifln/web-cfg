"""A cost reference cannot determine the bidder's tax regime."""

from itertools import product
import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.organic.breakout import align_sinapi_base


EDITAL = ("desonerado", "nao_desonerado", "silente", "contraditorio")
PLANILHA = ("desonerado", "nao_desonerado", "mista")
REGIME = ("desonerado", "nao_desonerado", "incerto")
INVALID_CASES = (
    ("mista", "desonerado", "desonerado"),
    ("incerto", "desonerado", "desonerado"),
    ("desonerado", "silente", "desonerado"),
    ("desonerado", "contraditorio", "desonerado"),
    ("desonerado", "desonerado", "mista"),
    ("desonerado", "desonerado", "silente"),
    ("", "desonerado", "desonerado"),
    ("desonerado", "__proto__", "desonerado"),
    ("desonerado", "desonerado", "constructor"),
)


@pytest.mark.parametrize("reference,company", [
    ("desonerado", "nao_desonerado"),
    ("nao_desonerado", "desonerado"),
])
def test_different_reference_does_not_require_changing_company_costs(reference, company):
    result = align_sinapi_base(reference, company, company)
    assert result["state"] == "REFERENCE_DIFFERS"
    assert "não torna a proposta incorreta" in result["verdict"]
    assert "não autoriza descumprir o edital" in result["cannot_conclude"][0]


def test_unknown_regime_never_produces_an_aligned_result():
    for reference, proposal in product(EDITAL, PLANILHA):
        result = align_sinapi_base(reference, proposal, "incerto")
        assert result["state"] in {"REGIME_UNKNOWN", "CONTRADICTION"}
        assert result["risk"] != "low"
    assert align_sinapi_base("desonerado", "desonerado", "incerto")["state"] == "REGIME_UNKNOWN"


@pytest.mark.parametrize("reference,proposal,company,expected", [
    ("desonerado", "desonerado", "desonerado", "ALIGNED"),
    ("nao_desonerado", "nao_desonerado", "nao_desonerado", "ALIGNED"),
    ("silente", "desonerado", "desonerado", "EDITAL_SILENT"),
    ("desonerado", "mista", "desonerado", "CONTRADICTION"),
    ("contraditorio", "nao_desonerado", "nao_desonerado", "CONTRADICTION"),
    ("desonerado", "desonerado", "nao_desonerado", "PROPOSAL_REGIME_GAP"),
    ("nao_desonerado", "nao_desonerado", "desonerado", "PROPOSAL_REGIME_GAP"),
])
def test_each_material_branch_preserves_its_limit(reference, proposal, company, expected):
    result = align_sinapi_base(reference, proposal, company)
    assert result["state"] == expected
    assert result["cannot_conclude"]
    if expected == "PROPOSAL_REGIME_GAP":
        assert "Confira encargos" in result["verdict"]
        assert "não uma decisão automática de desclassificação" in result["cannot_conclude"][0]


@pytest.mark.parametrize("inputs", INVALID_CASES)
def test_values_are_validated_for_their_specific_field(inputs):
    assert align_sinapi_base(*inputs)["state"] == "INVALID_INPUT"


def test_shipped_javascript_button_agrees_with_python_for_the_finite_input_space():
    # One process exercises the shipped event listener for all 36 selectable
    # combinations and representative invalid inputs, not a copied JS function.
    cases = list(product(EDITAL, PLANILHA, REGIME)) + list(INVALID_CASES)
    cases.append((" desonerado ", "desonerado", " desonerado"))
    node = shutil.which("node")
    assert node, "Node is required to verify the shipped SINAPI tool"
    driver = r'''
const fs = require("fs");
const vm = require("vm");
const cases = JSON.parse(fs.readFileSync(0, "utf8"));
const fields = {edital: {}, planilha: {}, regime: {}};
const output = {};
let click;
const form = {querySelector: selector => fields[selector.match(/name="(.*?)"/)[1]]};
const button = {addEventListener: (name, fn) => { if (name === "click") click = fn; }};
const root = {querySelector: selector => {
  if (selector === '[data-breakout-tool="sinapi-aligner"]') return form;
  if (selector === '[data-breakout-out="sinapi-aligner"]') return output;
  if (selector === '[data-breakout-run="sinapi-aligner"]') return button;
  return null;
}};
vm.runInNewContext(fs.readFileSync("assets/js/organic-breakout.js", "utf8"), {
  document: {querySelectorAll: selector => selector === ".breakout-chassis" ? [root] : []}
});
if (typeof click !== "function") throw new Error("SINAPI button was not bound");
process.stdout.write(JSON.stringify(cases.map(values => {
  ["edital", "planilha", "regime"].forEach((key, index) => { fields[key].value = values[index]; });
  output.hidden = true;
  output.textContent = "";
  click();
  return {text: output.textContent, hidden: output.hidden};
})));
'''
    completed = subprocess.run(
        [node, "-e", driver], cwd=ROOT, input=json.dumps(cases),
        text=True, capture_output=True, check=True, timeout=15,
    )
    observed = json.loads(completed.stdout)
    assert len(observed) == len(cases)
    for inputs, browser in zip(cases, observed):
        result = align_sinapi_base(*inputs)
        expected = result["verdict"] + " " + result["cannot_conclude"][0]
        assert browser == {"text": expected, "hidden": False}, inputs
