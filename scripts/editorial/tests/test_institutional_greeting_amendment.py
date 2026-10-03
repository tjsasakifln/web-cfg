"""Scoped commercial greetings cannot approve factual or source changes."""
from copy import deepcopy
from scripts.editorial.registry import approval_is_current, load_registry, material_hash, upsert_page
from scripts.editorial.sources import load_manifest


def approved_pages():
    return [page for page in load_registry()['pages'] if page['page_id'] in {'guia-checklist-aditivo','lei-item-novo-desconto'}]


def test_existing_decisions_allow_only_the_verified_institutional_greetings():
    pages=approved_pages()
    assert len(pages)==2
    for page in pages:
        assert approval_is_current(page)
        assert page['approval']['material_hash']!=material_hash(page)
        assert page['approval']['at'].startswith('2026-08-05')
        assert page['approval']['reviewer']=='Tiago Jun Sasaki'
        assert page['institutional_greeting_amendment']['actor']=='codex-autonomous-review'
        registry={'pages':[deepcopy(page)]}
        incoming=deepcopy(page)
        incoming.pop('approval')
        updated=upsert_page(registry,incoming)
        assert updated['approval']==page['approval']
        assert approval_is_current(updated)


def test_material_and_authorization_tampering_revokes_the_decision():
    for original in approved_pages():
        cases=[]
        page=deepcopy(original);page['body_markdown']+='\nUma nova afirmação factual.';cases.append(page)
        page=deepcopy(original);page['cta_whatsapp']+=' Receberemos anexos neste formulário.';cases.append(page)
        page=deepcopy(original);page['institutional_greeting_amendment']['substitutions'][0]['before']+=' adicional';cases.append(page)
        page=deepcopy(original);page['institutional_greeting_amendment']['substitutions'].append({'field':'title','before':'x','after':'y'});cases.append(page)
        page=deepcopy(original);page['institutional_greeting_amendment']['authorized_at']='2026-10-04';cases.append(page)
        page=deepcopy(original);page.pop('institutional_greeting_amendment');cases.append(page)
        page=deepcopy(original);page['approval']['material_hash']='0'*64;cases.append(page)
        page=deepcopy(original);page['approval']['preview']['material_hash']='0'*64;cases.append(page)
        page=deepcopy(original);page['approval']['sources_verified']=[];cases.append(page)
        for page in cases:
            page['material_hash']=material_hash(page)
            assert not approval_is_current(page)


def test_changed_used_source_still_requires_review():
    manifest=load_manifest()
    for page in approved_pages():
        changed=deepcopy(manifest)
        source=next(source for source in changed['sources'] if source['source_id'] in page['sources'])
        source['title']=source.get('title','')+' changed'
        assert not approval_is_current(page,changed)
