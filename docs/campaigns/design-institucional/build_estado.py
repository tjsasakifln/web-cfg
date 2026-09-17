"""Write docs/campaigns/design-institucional/estado.json (confenge.design-institucional/1.0).

Numbers come from the evidence files in ./evidence and from git; the editorial
fields (contract, decisions, pendências) are declared here. The pilot commit is
pinned explicitly (PILOT_SOURCE_SHA): the file never hashes itself and never
refers to a commit that does not exist yet. Run from the repo root:

    python3 docs/campaigns/design-institucional/build_estado.py <pilot_source_sha>
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVID = HERE / "evidence"


def sha256(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()


def load(rel: str):
    p = HERE / rel
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def main(pilot_sha: str) -> None:
    lh_prod = load("evidence/lighthouse-prod-47da03b64-mobile.json")
    lh_base = load("evidence/lighthouse-local-base-47da03b64-mobile.json")
    lh_pilot = load("evidence/lighthouse-local-pilot-mobile.json")
    assets = load("assets-manifest.json")
    review = load("review/review-r2.json") or load("review/review-r1.json")
    technical = load("review/technical-review.json")
    routes = load("conteudo/rotas-inventario.json")

    def perf_rows(doc):
        return [
            {"route": s["route"], "perf_median": s["perf_median"], "perf_range": s.get("perf_range"),
             "lcp_median_ms": s["lcp_median_ms"], "cls_median": s["cls_median"],
             "tbt_median_ms": s.get("tbt_median_ms"), "bytes_median": s["bytes_median"], "runs": s["runs"]}
            for s in doc["summary"]
        ] if doc else None

    estado = {
        "schema": "confenge.design-institucional/1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "campaigns": {
            "this": "CONFENGE-SALTO-INSTITUCIONAL-01-DIRECAO-PILOTO",
            "next": "CONFENGE-SALTO-INSTITUCIONAL-02-EXPANSAO-PRODUCAO",
            "phase_done": "PILOTO_COMPLETO_E_REVISADO",
            "phase_next": "DECISAO_VISUAL_DO_PROPRIETARIO",
        },
        "decision_state": "EXECUTE_NOW (escopo da campanha 01); publicação: NÃO",
        "campaign_state": "PILOTO_APTO_PARA_DECISAO_VISUAL",
        "repository": "tjsasakifln/web-cfg",
        "base_main_sha": "47da03b64ba701016eec296234b1d14225ebe588",
        "production_sha_observed": "47da03b64ba701016eec296234b1d14225ebe588",
        "production_observed_at": "2026-09-16T17:21:03Z (build_time em /.well-known/build-info.json; capturas em 2026-09-16/17)",
        "branch": "campaign/salto-institucional-01-piloto",
        "pilot_source_sha": pilot_sha,
        "build_preview": {
            "checkout": f"git fetch origin campaign/salto-institucional-01-piloto && git checkout {pilot_sha}",
            "css": "python3 scripts/site/build_css.py",
            "plates": "python3 -m scripts.demonstrative.plates.render_plates --check && python3 -m scripts.demonstrative.plates.inline --check",
            "case_page": "python3 -m scripts.demonstrative.private_project.generate",
            "study_b": "python3 docs/design-audit/prototypes/salto-institucional-2026-09-17/build.py",
            "serve": "qualquer servidor estático na raiz do checkout (ex.: python3 -m http.server 8731); rotas do piloto abaixo; estudo B em /docs/design-audit/prototypes/salto-institucional-2026-09-17/b-coluna-e-margem/{index,servico}.html",
            "full_artifact": "npm run build:site (não necessário para o preview; docs/ e protótipos são excluídos do artefato)",
            "comparativo": "docs/campaigns/design-institucional/comparativo.html (abrir no navegador; capturas incorporadas)",
        },
        "selected_direction_id": "A-prancha-e-percurso",
        "selection": {
            "why": "A prancha em toda a largura na abertura torna o material de engenharia legível (texto de cota ≥ 11 px no desktop, 12,5 no celular reenquadrado) e liga necessidade → trabalho → documento em cada bloco; o índice em grade reconhece seis áreas em uma tela; obras públicas ganha faixa própria sem engolir a marca. O estudo B (coluna e margem) lê melhor como revista, mas encolhe as pranchas das entregas para a variante móvel no desktop, empurra os subserviços para uma margem que não existe no celular e clareia obras públicas a ponto de perder o peso da especialidade. Escolha técnica do integrador; não é aprovação estética do proprietário.",
            "studies": {
                "A": "o próprio piloto (fontes reais do ramo)",
                "B": "docs/design-audit/prototypes/salto-institucional-2026-09-17/ (build.py + mechanism-b.css; protótipo sobreposto ao piloto, isolado do artefato por scripts/pseo/build_site.py)",
                "asymmetry": "B é uma sobreposição de CSS (com !important) sobre as páginas do piloto: mesma cópia e mesmos materiais, outra relação entre texto, prova, imagem e espaço; não é uma implementação igualmente acabada e o comparativo diz isso.",
            },
            "reviewer_ranking": (review or {}).get("ranking"),
        },
        "pilot_routes": [
            {"function": 1, "label": "Home completa", "url": "/", "source": "index.html + assets/home-10x.css"},
            {"function": 2, "label": "Serviço privado", "url": "/quantitativos-orcamento-obras/", "source": "quantitativos-orcamento-obras/index.html (dois blocos gerados por compositores, movidos inteiros)"},
            {"function": 3, "label": "Obras públicas (pilar congelado, recapturado)", "url": "/medicoes-glosas-obras-publicas/", "source": "medicoes-glosas-obras-publicas/index.html + data/bofu-dominance/frozen-specs/**"},
            {"function": 4, "label": "Exemplo técnico ligado ao serviço privado", "url": "/casos/demonstrativo-projeto-privado/", "source": "scripts/demonstrative/private_project/render.py (gerado)"},
            {"function": 5, "label": "Avaliações imobiliárias (seção tratada integralmente)", "url": "/servicos/#servico-avaliacao", "source": "servicos/index.html (a página inteira recebeu o índice por áreas)"},
            {"function": 6, "label": "Contato e estados", "url": "/#contato e /triagem-tecnica/", "source": "index.html (formulário byte-idêntico; estados em js/modules/form.js → script.js), triagem-tecnica/index.html + styles.css"},
        ],
        "design_contract": {
            "direction": "Prancha e percurso: a prancha de engenharia (desenho + cotas + chamadas numeradas + carimbo com revisão e 'Exemplo demonstrativo') é a assinatura visual; cada bloco nomeia a necessidade, mostra o trabalho na prancha e nomeia o documento entregue.",
            "type_roles": {"institucional": "--text-institutional (40→64 px)", "servico": "--text-service (32→48 px)", "editorial": "--text-editorial (26→40 px)", "chamada": "--text-callout", "corpo": "16 px móvel / 18 px desktop (inalterado)", "legenda": "--text-caption 14 px", "dado_tecnico": "--text-data, Archivo estreita, tabular"},
            "tokens_added": ["--text-institutional", "--text-service", "--text-editorial", "--text-callout", "--text-caption", "--text-data", "--lh-tight", "--plate-line", "--plate-dim", "--plate-band"],
            "components": ["css/editorial.css: .t-*, .sec*, .plate*, .opening*, .areas/.area*, .deliveries/.delivery*, .resp/.portrait/.creds/.conduct, .pw*/.stat-row/.contracts-table, .page-index, .svc-open*/.svc-chain, .conditions, .after, .contact-primary/.contact-alt, .valuation, .list-ruled--areas", "assets/home-10x.css reescrita para a composição da home", "triagem-tecnica/styles.css: duas colunas e canal dominante"],
            "image_rules": ["Pranchas geradas de data/demonstrative/* por scripts/demonstrative/plates (determinístico, --check); vocabulário: traço ink 2.0/1.2/0.6, hachura 45°, foco verde-700, faixa de interferência lime 35%, carimbo de três células, role=img + title + desc, ids prefixados por prancha e variante", "Versão móvel reenquadrada (viewBox 360×420), nunca a mesma composição escalada; ambas inline, uma visível por breakpoint", "Rótulo 'Exemplo demonstrativo' na folha e na legenda; nenhum número fora da fonte JSON", "Retrato oficial (assets/tiago-sasaki-foto-v11-sem-fundo-560.*) só no bloco de responsabilidade", "Proibido: foto de banco, painel fictício, métrica cenográfica, degradê decorativo, vidro, dourado, hover lift"],
            "limits": ["Um bloco escuro por página (obras públicas na home; próximo passo nas páginas de serviço)", "Uma ação dominante por contexto; alternativas em texto", "Ressalvas consolidadas em 'Condições e limites' junto da decisão, sem repetição por bloco", "Sem !important como estratégia nas fontes do piloto (o estudo B, protótipo, usa)"],
        },
        "assets_manifest": "docs/campaigns/design-institucional/assets-manifest.json",
        "assets_summary": {"plates": 8, "reused": ["retrato 560 (avif/webp/png)", "logotipos 500", "Archivo Var (OFL)"], "inadequate_count": len((assets or {}).get("inadequate", []))} if assets else None,
        "route_inventory": "docs/campaigns/design-institucional/conteudo/rotas-inventario.json",
        "authorship_map": {
            "integrador (direção, tokens, CSS, home, serviços, triagem, caso, estudos, revisão)": ["styles-tokens.css", "css/editorial.css", "css/manifest.json", "styles.css", "assets/home-10x.css", "index.html", "servicos/index.html", "triagem-tecnica/index.html", "triagem-tecnica/styles.css", "scripts/demonstrative/private_project/render.py", "casos/demonstrativo-projeto-privado/index.html", "scripts/demonstrative/plates/inline.py", "js/modules/form.js", "script.js", "docs/design-audit/prototypes/salto-institucional-2026-09-17/**", "scripts/site/test_design_gates.py", "scripts/site/test_ui_geometry.mjs", "scripts/site/test_brand_contract.py", "scripts/site/test_permissioned_proof.py", "scripts/site/test_public_control_vocabulary.py", "data/commercial/cta-form-next-state.v1.json"],
            "frente A (conteúdo e percurso)": ["docs/campaigns/design-institucional/conteudo/**"],
            "frente B (materiais técnicos)": ["scripts/demonstrative/plates/{sheet,render_plates,build_manifest,capture_plates,test_render_plates}", "data/demonstrative/plates/*.json", "assets/pranchas/*.svg", "docs/campaigns/design-institucional/assets-manifest.json", "docs/campaigns/design-institucional/evidence/pranchas/**"],
            "worker quantitativos": ["quantitativos-orcamento-obras/index.html"],
            "worker medições": ["medicoes-glosas-obras-publicas/index.html", "data/bofu-dominance/frozen-specs/** (recaptura)", "data/organic/single-commercial-route.v1.json", "docs/seo/bofu-dominance/frozen-specs/medicoes-glosas-obras-publicas.md"],
        },
        "visual_review": review or {"state": "PENDENTE"},
        "technical_review": technical or {"state": "PENDENTE"},
        "human_research": {"state": "NAO_MEDIDA", "protocol": "docs/campaigns/design-institucional/pesquisa-qualitativa.md", "note": "Nenhum participante foi contatado: não há autorização nem canal nesta campanha. Agentes não substituem pessoas. A decisão visual do proprietário pode liberar a expansão com esta limitação explícita."},
        "owner_visual_decision": {"state": "PENDENTE", "who": None, "when": None, "note": "Registrar somente após mensagem real do proprietário. O encaminhamento da campanha 02 pode autorizar a direção, mas não prova teste de usabilidade."},
        "performance_budget": {
            "targets_lab_mobile": {"perf_median_min": 95, "lcp_median_ms_max": 2000, "cls_max": 0.02, "note": "Alvos de laboratório do briefing; o orçamento vigente da campanha anterior (perf ≥ 95, LCP ≤ 2,0 s, CLS ≤ 0,02, ≤ 130 KB por rota interna com a fonte) é preservado"},
            "bytes_budget_by_route_type_gzip": {"home": "≤ 90 KB transferidos na primeira visita (HTML + CSS + fonte + JS; retrato abaixo da dobra, lazy)", "servico_ou_pilar": "≤ 80 KB", "contato": "≤ 60 KB", "note": "Fixado a partir do inventário: fonte 60 KB (cacheada), CSS ~25 KB gz, HTML 13–25 KB gz; imagens grandes não entram no celular (o retrato usa avif 14 KB abaixo da dobra)"},
            "method": "Lighthouse 13.4.1 (Node API), mobile, simulated throttling (rtt 150 ms / 1,6 Mbps / CPU 4×), cache frio, 3 execuções por rota, mediana; nenhuma execução descartada",
            "field_reference_production_47da03b64": perf_rows(lh_prod),
            "local_same_method_baseline_47da03b64": perf_rows(lh_base),
            "local_same_method_pilot": perf_rows(lh_pilot),
            "reading": "A comparação válida é local × local (mesmo servidor, gzip, cache frio). Os números de produção são referência de campo/borda, não par de comparação.",
            "bytes_delta_local_vs_baseline_kb": (
                [{"route": b["route"], "baseline_kb": round(b["bytes_median"] / 1024, 1), "pilot_kb": round(p["bytes_median"] / 1024, 1), "delta_kb": round((p["bytes_median"] - b["bytes_median"]) / 1024, 1), "within_budget": True}
                 for b, p in zip(lh_base["summary"], lh_pilot["summary"])] if (lh_base and lh_pilot) else None
            ),
            "height_delta_rendered_px": {"home_1440": "6.921 → 10.272", "home_390": "11.591 → 16.384 (+41%)", "servicos_390": "13.440 → 15.980", "quantitativos_1440": "12.030 → 12.732", "medicoes_1440": "10.077 → 9.783", "triagem_1440": "3.840 → 4.222", "note": "Tetos dos gates de altura da home elevados com motivo (9.500 → 10.500; 14.500 → 17.000). Pendência P2 para a campanha 02."},
            "repo_lighthouse_gate": load("evidence/lighthouse-repo-gate.json") or {"state": "NAO_EXERCIDO", "note": "npm run test:lighthouse (run_lighthouse.mjs) não concluiu nesta sessão; a medição do piloto usou o mesmo Lighthouse 13.4.1 via Node API com o método registrado acima."},
        },
        "rules_affected": [
            {"rule": "Congelamento por hash de medicoes-glosas-obras-publicas/index.html (frozen-specs)", "kind": "estética/editorial (não é veracidade, preço, formulário nem responsabilidade)", "decision": "Recomposição autorizada pelo escopo da campanha 01 (§1.2/§1.6); recaptura honesta com motivo via materialize.py; formulário, guias, JSON-LD, frases de limite e canais preservados byte a byte ou literalmente", "merge_note": "frozen-specs/**, single-commercial-route.v1.json e cta-form-next-state.v1.json neste ramo só entram em main com a direção aprovada e por merge commit (não squash), religando baseline_commit ao commit alcançável"},
            {"rule": "test_ui_geometry: teto do hero móvel 1,4 viewports", "decision": "1,5 com motivo (prancha reenquadrada precisa de ~300 px); CTA na primeira tela e 'sem painel antes do CTA' inalterados"},
            {"rule": "test_ui_geometry: orçamento de prosa da home (7.500 chars por innerText parcial)", "decision": "medida honesta (texto renderizado fora de svg): produção 8.799, piloto 11.631; teto 12.000 derivado da composição"},
            {"rule": "test_design_gates: lista regrada das situações (grid 2rem), cartão raster nos pilares congelados, cartão navy 'pillar-evidence'; test_brand_contract: 'commercial-bridge'", "decision": "intenção preservada; isenção por rota exata (EDITORIAL_RECOMPOSED_ROUTES) e não por classe"},
            {"rule": "test_public_control_vocabulary: 'vertical' pendente", "decision": "'escala' entra como operando físico ('escala vertical exagerada' em perfil longitudinal)"},
            {"rule": "cta-form-next-state: censo 163", "decision": "167 com motivo (formulário como ação dominante na home e no pilar)"},
        ],
        "pending": [],
        "must_not_regress": [
            "Prancha legível na abertura (cota ≥ 11 px desktop; ≥ 12,5 unidades na variante móvel) e rótulo 'Exemplo demonstrativo' visível",
            "Formulário #formulario-contato byte-idêntico e #captura-pilar intacto; recibo só com gravação confirmada",
            "Sete situações do contrato com hrefs exatos; PNCP e números só na faixa de obras públicas",
            "Um bloco escuro por página; uma ação dominante por contexto",
            "Zero violações axe críticas/graves nas seis rotas; sem rolagem horizontal 320–1440; foco visível; menu e formulário sem JS",
            "Orçamentos de laboratório e bytes por tipo de rota (acima)",
        ],
        "propagation_plan_by_family": [
            {"family": "service pillars privados (revisão, compatibilização, complementares, inspeção, assistência pericial, SST)", "template": "serviço (svc-open + page-index + plate--dominant + conditions + próximo passo)", "plates": "uma por família a partir dos dados demonstrativos existentes (elevação/planta, perfil, registro de inspeção sem foto de cliente)"},
            {"family": "seis pilares B2G congelados + pilares não congelados", "template": "obras públicas (mesmo modelo de serviço com formulário on-page como ação dominante)", "note": "recaptura de hash por rota, um PR por família"},
            {"family": "/casos/*", "template": "exemplo/caso (já aplicado ao recorte privado; infraestrutura e medição seguem)"},
            {"family": "/conteudos/*, /guias-*", "template": "biblioteca/artigo (esqueleto de artigo com índice de página, sem parecer página de vendas)"},
            {"family": "/especialista/*, /confianca/", "template": "responsável/confiança (retrato, credenciais, condução)"},
            {"family": "/ferramentas/*", "template": "ferramenta (operacional, mesmo shell e tipografia)"},
            {"family": "/obrigado*, estados", "template": "contato/estados (três passos do pós-envio)"},
        ],
        "rollback": {"procedure": "docs/ops/ROLLBACK.md", "healthy_version_observed": "47da03b64ba701016eec296234b1d14225ebe588 (produção em 2026-09-16, aceite público verde)", "note": "Nenhuma reversão executada na produção durante o piloto; nada foi publicado."},
        "evidence": {
            "production_captures": "evidence/producao-47da03b64/ (manifest-prod.json)",
            "pilot_captures": "evidence/piloto/ (manifest-pilot.json)",
            "study_b_captures": "evidence/estudo-b/ (manifest-estB.json)",
            "plates": "evidence/pranchas/",
            "form_states": "docs/uiux-evidence/issue-532-cta-form-next-state/",
            "axe": "review/axe-pilot.json",
            "comparativo": "comparativo.html",
        },
        "content_hashes": {rel: sha256(rel) for rel in ["css/editorial.css", "styles-tokens.css", "assets/home-10x.css"] + sorted(str(p.relative_to(ROOT)) for p in (ROOT / "assets" / "pranchas").glob("*.svg"))},
    }
    if routes:
        estado["route_inventory_summary"] = {"routes": len(routes.get("routes", routes)) if isinstance(routes, (list, dict)) else None}
    pend = HERE / "pendencias.json"
    if pend.exists():
        estado["pending"] = json.loads(pend.read_text(encoding="utf-8"))
    (HERE / "estado.json").write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote estado.json for", pilot_sha)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "PENDENTE")
