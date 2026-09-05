# Fragmento de integração — bloco reutilizável de prova

Owner de integração: **MV-09** ou campanha futura dona da superfície. Este arquivo não autoriza alteração de home ou money pages pela MV-02.

## Interface disponível

O módulo `scripts.site.credential_registry` expõe:

- `project(registry, surface)`: seleciona apenas claims publicáveis, não vencidos e não revogados;
- `render_trust_proof_block(surface, claims, as_of)`: gera o bloco visível com claim, origem, data e limite;
- `apply_to_html(html, projection)`: troca o bloco delimitado e os campos gerenciados de JSON-LD na mesma operação;
- `withheld_visible_claim_errors(html, registry)`: impede aliases de claims retidos na copy pública.

O bloco está em uso nas duas superfícies owner: `/confianca/` e `/especialista/tiago-jun-sasaki/`. Não copie manualmente CNPJ, formação ou credencial para outra página: primeiro declare a superfície e a projeção no registro, valide paridade e só então integre o HTML gerado.

## Proposta para uma futura money page

Use um bloco curto depois da explicação do serviço e antes do CTA:

> **Quem responde por este trabalho**
>
> A CONFENGE identifica a empresa, o profissional e as formalidades aplicáveis ao escopo. [Conferir identidade, formação e fontes](/confianca/).

Esse fragmento não deve duplicar números profissionais retidos, endereço, cliente, resultado ou selo. A página de confiança é a fonte pública detalhada; a money page apenas conduz à verificação.

## Critérios de aceite da integração futura

1. A família pública e o gate de conversão da rota já devem estar declarados pelo owner correto.
2. Nenhum claim `WITHHELD`, vencido, revogado ou `never_project` pode aparecer em HTML, meta ou JSON-LD.
3. Retirada de claim remove copy e schema no mesmo build.
4. O link não cria handoff de marca nem CTA para SmartLic.
5. Analytics registra apenas a interação e o contexto `CONFENGE_WEB`, sem PII.
