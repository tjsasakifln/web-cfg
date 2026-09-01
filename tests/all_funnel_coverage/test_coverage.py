import copy
from scripts.all_funnel_coverage.coverage import load, validate

def test_committed_map_is_valid_and_bofu_reconciled():
    assert sum(validate(load()).values()) >= 11

def test_family_without_state_fails():
    doc = load(); del doc["families"][0]["current_coverage"]
    try: validate(doc)
    except AssertionError as exc: assert "missing" in str(exc)
    else: raise AssertionError("expected fail closed")

def test_duplicate_owner_and_closed_owner_fail():
    doc = load(); doc["families"][1]["canonical_owner"] = {"bofu_join_family_id":"orcamento-bdi"}
    try: validate(doc)
    except AssertionError as exc: assert "conflicting owner" in str(exc)
    else: raise AssertionError("expected owner conflict")
    doc = load(); doc["families"][0]["canonical_owner"] = {"bofu_join_family_id":"bid-readiness"}
    try: validate(doc)
    except AssertionError as exc: assert "closed issue" in str(exc)
    else: raise AssertionError("expected closed issue failure")

def test_unknown_zero_queue_and_implicit_mutation_fail():
    doc = load(); doc["families"][0]["search_evidence"][0]["freshness"] = "UNKNOWN"; doc["families"][0]["search_evidence"][0]["limitations"] = "0 impressions"
    try: validate(doc)
    except AssertionError as exc: assert "zero" in str(exc)
    else: raise AssertionError("expected UNKNOWN failure")
    doc = load(); doc["candidate_actions"] *= 2
    try: validate(doc)
    except AssertionError: pass
    else: raise AssertionError("expected queue cap failure")
    doc = load(); doc["families"][0]["authorizes_public_mutation"] = True
    try: validate(doc)
    except AssertionError: pass
    else: raise AssertionError("expected mutation failure")

def test_non_icp_requires_deprioritize_and_stale_is_not_current():
    doc = load(); doc["families"][-1]["current_coverage"] = "CONTENT_GAP"
    try: validate(doc)
    except AssertionError: pass
    else: raise AssertionError("expected non-ICP failure")
    doc = load(); doc["external_breadth"]["state"] = "STALE"; assert validate(doc)

def test_keyword_or_url_backlog_is_rejected():
    doc = load(); doc["families"][0]["keywords"] = ["not permitted"]
    try: validate(doc)
    except AssertionError as exc: assert "backlog" in str(exc)
    else: raise AssertionError("expected keyword backlog failure")
