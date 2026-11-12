#!/usr/bin/env python3
"""Render the first residential enquiry surface without inventing a product."""
from __future__ import annotations

import argparse
import json
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.site.public_footer import render_public_footer

ORIGIN = "https://confenge.com.br"
ROUTE = "/projetos-prontos/"
WA = "https://wa.me/5548988344559?text=Ol%C3%A1%2C%20CONFENGE.%20Quero%20consultar%20um%20projeto%20residencial%20e%20sua%20adequa%C3%A7%C3%A3o%20ao%20meu%20terreno."


def header() -> str:
    brand = json.loads((ROOT / "data/site/brand.json").read_text())
    links = "".join(f'<a href="{escape(x["href"])}"' + (' aria-current="page"' if x["href"] == '/projetos/' else '') + f'>{escape(x["label"])}</a>' for x in brand['navigation']['desktop'])
    return f'''<header class="pp-header"><div class="pp-container pp-header__inner">
<a class="pp-brand" href="/" aria-label="CONFENGE, página inicial"><img src="/assets/logo-confenge-500-f8a83f6d.png" width="224" height="58" alt="CONFENGE"/></a>
<nav class="pp-nav" aria-label="Navegação principal">{links}</nav>
<a class="pp-button pp-button--compact" href="{ROUTE}#contato-projetos">Consultar projeto</a>
<details class="pp-mobile"><summary aria-label="Menu"><span>Menu</span></summary><nav aria-label="Navegação móvel">{links}</nav></details>
</div></header>'''


def page(route: str, title: str, description: str, body: str) -> str:
    crumb = [{'@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': ORIGIN + '/'}, {'@type': 'ListItem', 'position': 2, 'name': 'Projetos', 'item': ORIGIN + '/projetos/'}, {'@type': 'ListItem', 'position': 3, 'name': 'Projetos prontos', 'item': ORIGIN + ROUTE}]
    if route != ROUTE:
        crumb.append({'@type': 'ListItem', 'position': 4, 'name': 'Condições', 'item': ORIGIN + route})
    schema = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'WebPage', '@id': ORIGIN + route + '#webpage', 'url': ORIGIN + route, 'name': title, 'description': description, 'inLanguage': 'pt-BR', 'datePublished': '2026-11-12', 'dateModified': '2026-11-12', 'isPartOf': {'@id': ORIGIN + '/#website'}},
        {'@type': 'BreadcrumbList', '@id': ORIGIN + route + '#breadcrumb', 'itemListElement': crumb}]}
    breadcrumbs = '<nav class="pp-breadcrumb breadcrumbs pp-container" aria-label="Você está em"><ol>' + ''.join(f'<li><a href="{x["item"].replace(ORIGIN, "")}">{escape(x["name"])}</a></li>' if i < len(crumb)-1 else f'<li aria-current="page">{escape(x["name"])}</li>' for i, x in enumerate(crumb)) + '</ol></nav>'
    return f'''<!doctype html>
<html lang="pt-BR" class="no-js"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{escape(title)} | CONFENGE</title>
<meta name="description" content="{escape(description, quote=True)}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="{ORIGIN}{route}"/>
<meta property="og:type" content="website"/><meta property="og:locale" content="pt_BR"/>
<meta property="og:title" content="{escape(title, quote=True)} | CONFENGE"/>
<meta property="og:description" content="{escape(description, quote=True)}"/>
<meta property="og:url" content="{ORIGIN}{route}"/>
<meta property="og:image" content="{ORIGIN}/assets/og-confenge.jpg"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="icon" href="/favicon.ico"/>
<link rel="preload" as="font" type="font/woff2" href="/assets/archivo-var-latin-b19be0f7.woff2" crossorigin="anonymous"/>
<link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/assets/project-practices.css"/><link rel="stylesheet" href="/assets/ready-projects.css"/>
<script>document.documentElement.classList.replace('no-js','js');</script>
<script defer src="/script.js"></script>
<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False, separators=(',', ':'))}</script>
</head><body class="ready-projects-page" data-content-type="service" data-route-family="ready_projects" data-asset-id="ready-projects">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
{header()}
<main id="conteudo">{breadcrumbs}{body}</main>
{render_public_footer(published_at='2026-11-12', modified_at='2026-11-12')}
</body></html>
'''


def landing() -> str:
    ufs = ''.join(f'<option value="{uf}">{uf}</option>' for uf in 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())
    attrs = 'data-route-family="ready_projects" data-asset-id="ready-projects" data-journey="projeto" data-origem="/projetos-prontos/" data-origin-url="/projetos-prontos/"'
    body = f'''
<section class="rp-hero"><div class="pp-container rp-hero-grid"><div>
<p class="pp-eyebrow">Projetos prontos · consulta de disponibilidade</p>
<h1>Seu terreno. Sua casa.<br/>O projeto certo para começar.</h1>
<p class="rp-intro">Diga como imagina sua casa. A CONFENGE verifica a disponibilidade de um projeto residencial e organiza a adaptação e os complementares necessários à sua obra.</p>
<div class="pp-actions"><a class="pp-button" href="#contato-projetos" data-event-name="project_cta_click" data-cta-id="ready-projects-hero" data-cta-position="hero" {attrs}>Consultar disponibilidade</a><a class="pp-text-link" href="#como-funciona">Como funciona</a></div>
<p class="rp-availability"><strong>Primeira seleção em preparação.</strong> Hoje recebemos consultas. Nenhum modelo está disponível para compra online. O envio é sem compromisso e não gera cobrança.</p>
</div><aside class="rp-brief" aria-labelledby="brief-title"><p class="pp-kicker">Da ideia à proposta</p><h2 id="brief-title">O ponto de partida é a casa que você precisa.</h2><dl>
<div><dt>01 · Seu terreno</dt><dd>Município e UF. As medidas ajudam, mas você pode informar depois.</dd></div>
<div><dt>02 · Sua casa</dt><dd>Casa térrea, dois ou três dormitórios, espaços e prioridades da sua família.</dd></div>
<div><dt>03 · Próximo passo</dt><dd>Conferimos a disponibilidade e definimos o trabalho, o preço e o prazo antes de contratar.</dd></div>
</dl></aside></div></section>
<section class="rp-section" id="como-funciona"><div class="pp-container"><p class="pp-kicker">Uma solução, escopos claros</p><h2>Escolha o projeto. Defina o que sua obra precisa.</h2><p class="rp-section-lead">A proposta pode reunir as três contratações abaixo. Você confere as entregas, os valores, os prazos e os responsáveis de cada uma antes de decidir.</p>
<div class="rp-services">
<article><span class="rp-number">01 · Licença do projeto</span><h3>Um modelo já desenvolvido</h3><p>Quando houver um modelo disponível, a página apresentará as plantas reais, o programa, a área, os documentos, os formatos e a versão incluídos. A licença será para uma implantação.</p><p><strong>Situação atual:</strong> consulta de disponibilidade, sem preço ou compra online.</p><a href="#contato-projetos" data-project-interest="license">Consultar um projeto pronto</a></article>
<article><span class="rp-number">02 · Adaptação ao terreno</span><h3>O projeto no seu lote</h3><p>Avaliação de implantação, orientação, desníveis, acessos e exigências locais. O escopo depende do modelo e das informações do terreno.</p><p><strong>Contratação:</strong> orçamento específico, com entregas, honorários, prazo e responsabilidade definidos na proposta.</p><a href="#contato-projetos" data-project-interest="adaptation">Consultar adaptação</a></article>
<article><span class="rp-number">03 · Projetos complementares</span><h3>As disciplinas para construir</h3><p>Estruturas, fundações e instalações conforme as necessidades da casa e as condições reais do imóvel. A proposta identifica as disciplinas contratadas e suas interfaces.</p><p><strong>Contratação:</strong> orçamento específico. Nenhuma disciplina está incluída automaticamente na licença.</p><a href="#contato-projetos" data-project-interest="complementary">Solicitar complementares</a></article>
</div><p class="rp-section-lead">O uso de um projeto no terreno depende de avaliação profissional e das regras locais. A aquisição dos arquivos não inclui aprovação municipal, financiamento, execução ou acompanhamento da obra. <a href="/projetos-prontos/condicoes/">Conheça as condições de consulta e aquisição.</a></p></div></section>
<section class="rp-section rp-contact" id="contato-projetos"><div class="pp-container rp-contact-grid"><div class="rp-contact-copy"><p class="pp-kicker">Conte o que pretende construir</p><h2>Vamos entender a sua casa e o seu terreno.</h2><p>Informe um contato e o município. Se ainda estiver procurando um lote, indique a cidade pretendida. Os demais detalhes podem ser conversados depois.</p><p>Após o registro, você recebe um protocolo. A equipe entra em contato para conferir a disponibilidade e definir o próximo passo, sem compromisso de contratação.</p><div class="contact-alt"><a href="{WA}" target="_blank" rel="noopener" data-event-name="whatsapp_click" data-cta-id="ready-projects-whatsapp" data-cta-position="form-alternative" {attrs}>Prefere conversar pelo WhatsApp?</a><a href="mailto:tiago.sasaki@confenge.com.br?subject=Consulta%20sobre%20projeto%20residencial" data-event-name="email_click" data-cta-id="ready-projects-email" data-cta-position="form-alternative" {attrs}>tiago.sasaki@confenge.com.br</a></div></div>
<form class="contact-form rp-form" id="formulario-contato" name="diagnostico-confenge" method="POST" action="/.netlify/functions/lead" data-capture-form data-ajax="true" data-receipt-required="true" data-success-inline="true" data-form-contract="next-state/v1" data-next-state-profile="ready_project_interest" data-runtime-profile="shared_lead_form_v1" data-intent="ready_project_interest" {attrs}>
<input type="hidden" name="form-name" value="diagnostico-confenge"/><input type="hidden" id="estagio" name="estagio" value="projetos-prontos"/><input type="hidden" id="jornada-hidden" name="jornada" value="projeto"/><input type="hidden" name="intent" value="ready_project_interest"/>
<input type="hidden" name="asset_id" value="ready-projects"/><input type="hidden" name="source_asset_id" value="ready-projects"/><input type="hidden" name="route_family" value="ready_projects"/><input type="hidden" name="cta_id" value="ready-projects-interest-submit"/><input type="hidden" name="origem" value="/projetos-prontos/"/><input type="hidden" name="landing_page" value="/projetos-prontos/"/><input type="hidden" name="tema" value="Projeto residencial para o terreno"/>
<div class="rp-honeypot" aria-hidden="true"><label for="project-website">Não preencha este campo</label><input id="project-website" name="bot-field" tabindex="-1" autocomplete="off"/></div>
<p class="form-hint" data-form-value>Conte como imagina sua casa. A equipe confere a disponibilidade e orienta o próximo passo.</p>
<p class="form-hint" data-field-purpose>Nome, um meio de contato, município, UF e interesse permitem atender sua consulta. Os detalhes do terreno e da casa são opcionais.</p>
<fieldset><legend>Sua consulta</legend><div class="rp-fields">
<div class="rp-wide"><label for="nome">Nome</label><input id="nome" name="nome" autocomplete="name" minlength="2" maxlength="120" required/></div>
<div><label for="telefone">WhatsApp</label><input id="telefone" name="telefone" type="tel" inputmode="tel" autocomplete="tel" maxlength="25" aria-describedby="rp-contact-hint"/></div>
<div><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" maxlength="180" aria-describedby="rp-contact-hint"/></div>
<p id="rp-contact-hint" class="rp-hint rp-wide">Informe WhatsApp com DDD ou e-mail. Um dos dois é suficiente para receber o retorno.</p>
<div><label for="city">Município do terreno</label><input id="city" name="city" autocomplete="address-level2" minlength="2" maxlength="80" required/></div>
<div><label for="uf">UF</label><select id="uf" name="uf" autocomplete="address-level1" required><option value="">Selecione</option>{ufs}</select></div>
<div class="rp-wide"><label for="project_kind">O que você procura?</label><select id="project_kind" name="project_kind" required><option value="license">Consultar um projeto pronto</option><option value="adaptation">Adaptar um projeto ao terreno</option><option value="complementary">Contratar projetos complementares</option><option value="custom">Solicitar o projeto da minha casa</option></select></div>
</div>
<details><summary>Detalhes da casa e do terreno <span class="rp-hint">(opcional)</span></summary><div class="rp-fields">
<div><label for="lot_width_m">Frente do lote, em metros</label><input id="lot_width_m" name="lot_width_m" type="number" min="0.5" max="10000" step="0.01" inputmode="decimal"/></div>
<div><label for="lot_depth_m">Profundidade, em metros</label><input id="lot_depth_m" name="lot_depth_m" type="number" min="0.5" max="10000" step="0.01" inputmode="decimal"/></div>
<div><label for="lot_status">Você já tem o terreno?</label><select id="lot_status" name="lot_status"><option value="unknown">Ainda não sei informar</option><option value="owned">Sim, já tenho</option><option value="buying">Estou comprando</option><option value="searching">Estou procurando</option></select></div>
<div><label for="bedrooms">Dormitórios desejados</label><select id="bedrooms" name="bedrooms"><option value="unknown">Ainda vou definir</option><option value="2">2 dormitórios</option><option value="3">3 dormitórios</option><option value="other">Outra quantidade</option></select></div>
<div class="rp-wide"><label for="build_when">Quando pretende construir?</label><select id="build_when" name="build_when"><option value="unknown">Ainda vou definir</option><option value="0_6m">Nos próximos 6 meses</option><option value="6_12m">Entre 6 e 12 meses</option><option value="over_12m">Depois de 12 meses</option></select></div>
<div class="rp-wide"><label for="mensagem">O que mais importa na sua casa?</label><textarea id="mensagem" name="mensagem" rows="3" maxlength="2000" placeholder="Se quiser, conte como imagina a casa. Não inclua documentos ou dados sensíveis."></textarea></div>
</div></details>
<label class="rp-consent" for="consentimento"><input id="consentimento" name="consentimento" type="checkbox" value="true" required/><span>Autorizo o uso destes dados para atender esta solicitação, conforme a <a href="/privacidade/">Política de Privacidade</a>. Este envio não me inscreve em comunicações promocionais.</span></label>
<div id="turnstile-slot" class="turnstile-slot" hidden data-turnstile-sitekey=""><div class="cf-turnstile" data-theme="light" data-size="compact"></div></div>
<button class="pp-button" type="submit" data-cta-id="ready-projects-interest-submit">Consultar disponibilidade</button>
</fieldset><p class="form-status" id="form-status" role="status" aria-live="polite"></p>
<p class="form-hint" data-form-boundary>O envio registra uma consulta, sem cobrança ou obrigação de contratar. Os dados serão usados para este atendimento, sem adesão a comunicações promocionais. Consulte a Política de Privacidade. Retenção de até 730 dias; você pode solicitar a exclusão pelos canais institucionais.</p>
</form></div></section>
<section class="rp-section"><div class="pp-container rp-faq"><p class="pp-kicker">Antes de decidir</p><h2>O que é útil saber agora.</h2>
<details><summary>Posso comprar e baixar um projeto hoje?</summary><p>Ainda não. Estamos recebendo consultas para a primeira seleção. Quando um modelo estiver disponível, você poderá conferir as amostras reais, o conteúdo, o preço e as condições antes de comprar. O formulário atual não cria um pedido de compra.</p></details>
<details><summary>Preciso saber todas as medidas para consultar?</summary><p>Não. Informe o município e a UF, além de um contato. Se souber a frente, a profundidade e os ambientes desejados, inclua esses dados. Eles ajudam a entender a necessidade, mas não substituem levantamento do terreno.</p></details>
<details><summary>Um projeto pronto serve para qualquer terreno?</summary><p>A implantação depende de dimensões, relevo, orientação, solo, acessos e exigências locais. Um profissional habilitado precisa avaliar a adequação e definir as adaptações necessárias antes da execução. A aprovação é feita pelos órgãos competentes.</p></details>
<details><summary>E se eu precisar de outra distribuição ou de mais disciplinas?</summary><p>Conte o que precisa mudar ou acrescentar. A proposta pode combinar a elaboração do projeto da casa, sua adaptação ao terreno e os projetos complementares, com as entregas e responsabilidades definidas.</p></details>
</div></section>'''
    return page(ROUTE, 'Projetos prontos residenciais: consulte a disponibilidade', 'Consulte projetos residenciais, adaptação ao terreno e complementares. Informe município, contato e o que pretende construir. Consulta sem cobrança.', body)


def conditions() -> str:
    body = '''<article class="pp-container rp-terms"><p class="pp-kicker">Projetos residenciais</p><h1>Condições de consulta e aquisição.</h1>
<p><strong>Atualização: 12 de novembro de 2026.</strong> Esta seção recebe consultas. Nenhum projeto está disponível para compra online neste momento.</p>
<h2>1. Consulta e proposta</h2><p>O formulário registra seu interesse, sem cobrança, reserva de produto ou obrigação de contratar. A equipe confere a disponibilidade e conversa sobre o terreno e a casa. Uma contratação depende da definição de escopo, preço, prazo, entregas e responsáveis, com seu aceite.</p>
<h2>2. Licença, adaptação e complementares</h2><p>A licença de uso de um projeto pronto, a adaptação ao terreno e os projetos complementares são contratações distintas, que podem ser reunidas na proposta. A licença contempla somente os documentos, disciplinas, formatos e a versão descritos na oferta aprovada. Adaptações e complementares dependem de orçamento específico.</p>
<p>Na futura oferta, a licença permitirá uma implantação no imóvel identificado na contratação. O compartilhamento com os profissionais dessa implantação será autorizado nos limites do contrato. Revenda, distribuição pública e reutilização em outro imóvel não estarão autorizadas. Uma nova implantação exige licença própria. Alterações devem respeitar os direitos do autor e a responsabilidade de profissional habilitado.</p>
<h2>3. Terreno, aprovação e execução</h2><p>As condições locais precisam ser avaliadas antes de utilizar o projeto: dimensões, relevo, solo, orientação, infraestrutura, acessos e regras municipais, entre outras exigências aplicáveis. A compra de arquivos não inclui aprovação municipal, financiamento, execução ou acompanhamento de obra. A proposta identifica as atividades técnicas assumidas, seus profissionais e os registros de responsabilidade cabíveis.</p>
<p>Esses limites não afastam a responsabilidade pelo conteúdo e pelos defeitos do projeto efetivamente vendido.</p>
<h2>4. Preço, pagamento e entrega</h2><p>Quando houver produto aprovado para venda, sua página informará preço total, formas de pagamento, prazo, arquivos, versão, condições de uso e suporte antes da compra. A entrega ocorrerá por acesso protegido do comprador, após confirmação do pagamento pelo provedor. Atualmente não existe cobrança disponível nesta seção.</p>
<h2>5. Correções, alterações e cancelamento</h2><p>Serão preservados o direito de arrependimento nas compras online, inclusive o prazo legal de sete dias, e os demais direitos do consumidor. O acesso ou download de arquivos não implica renúncia automática. O atendimento verificará problemas de arquivo ou de conteúdo e aplicará as soluções devidas, sem tratar correção de defeito como adaptação adicional paga.</p>
<p>Mudanças de preferência, ampliação do programa ou novas disciplinas serão avaliadas em orçamento próprio. As condições específicas de atendimento e cancelamento estarão disponíveis antes da futura compra. A consulta atual não cria cobrança a cancelar.</p>
<h2>6. Dados e atendimento</h2><p>Usamos os dados informados para responder à solicitação e acompanhar o atendimento, conforme a <a href="/privacidade/">Política de Privacidade</a>. O envio não implica adesão a publicidade. Não envie CPF, documentos pessoais, matrícula do imóvel ou arquivos confidenciais nesta primeira consulta.</p>
<p>CONFENGE, CNPJ 52.407.089/0001-09. Atendimento por <a href="mailto:tiago.sasaki@confenge.com.br">tiago.sasaki@confenge.com.br</a> ou <a href="tel:+5548988344559">(48) 98834-4559</a>.</p>
<p>Referências: <a href="https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm">Código de Defesa do Consumidor</a>, <a href="https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm">Decreto nº 7.962/2013</a>, <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm">Lei Geral de Proteção de Dados</a> e <a href="https://www.planalto.gov.br/ccivil_03/leis/l9610.htm">Lei de Direitos Autorais</a>.</p>
<p><a class="pp-button" href="/projetos-prontos/#contato-projetos">Consultar um projeto residencial</a></p></article>'''
    return page(ROUTE + 'condicoes/', 'Condições dos projetos residenciais', 'Entenda a consulta, a licença de uso, a adaptação ao terreno, os complementares e o atendimento dos projetos residenciais CONFENGE.', body)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    pages = {'projetos-prontos/index.html': landing(), 'projetos-prontos/condicoes/index.html': conditions()}
    # The canonical form normalizer supplies the common no-JavaScript note.
    for rel, html in pages.items():
        path = ROOT / rel
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(html, encoding='utf-8')
            print(rel)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
