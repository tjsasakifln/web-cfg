"""Render reviewed B2G openings without rewriting technical content or forms."""
import argparse, json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def render(page, text):
    opening=f'<!-- institutional-b2g-opening:start --><p class="hero-deliverable" data-b2g-opening>{page["substance"]}</p><!-- institutional-b2g-opening:end -->'
    contract=f'<!-- institutional-b2g-contract:start --><details class="offer-detail-disclosure" id="responsabilidade-servico"><summary class="container">Responsabilidades na contratação</summary><div class="container prose"><h2>{page["heading"]}</h2><p>{page["conditions"]}</p></div></details><!-- institutional-b2g-contract:end -->'
    for kind, content in [('opening',opening),('contract',contract)]:
        pattern=rf'<!-- institutional-b2g-{kind}:start -->.*?<!-- institutional-b2g-{kind}:end -->'
        text,n=re.subn(pattern,lambda _:content,text,flags=re.S)
        if n!=1: raise ValueError(f'{page["route"]}: missing or duplicate {kind} slot')
    # Work comes before the action and leadership, including the two routes
    # whose byline uses authority-byline instead of offer-proof-line.
    text,n=re.subn(r'<!-- institutional-b2g-opening:start -->.*?<!-- institutional-b2g-opening:end -->\n?', '',text,flags=re.S)
    if n!=1: raise ValueError(f'{page["route"]}: invalid opening placement')
    text,n=re.subn(r'(?=<div\b[^>]*class="[^"]*\bhero-actions\b[^"]*")',lambda _:opening+'\n',text,count=1)
    if n!=1: raise ValueError(f'{page["route"]}: missing primary action group')
    return text

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');args=parser.parse_args()
    data=json.loads((ROOT/'data/commercial/institutional-b2g-openings.v1.json').read_text(encoding='utf-8'))
    drift=[]
    for page in data['pages']:
        path=ROOT/page['route']/'index.html';text=path.read_text(encoding='utf-8');updated=render(page,text)
        hero=updated.split('<!-- institutional-b2g-contract:start -->',1)[0]
        if '<dt>Limite</dt>' in hero or 'Em 30 segundos' in hero: raise ValueError(f'{page["route"]}: rejected hero framing')
        if updated!=text:
            if args.write:path.write_text(updated,encoding='utf-8',newline='\n')
            else:drift.append(page['route'])
    print(json.dumps({'pages':len(data['pages']),'drift':drift}))
    return bool(drift)
if __name__=='__main__':raise SystemExit(main())
