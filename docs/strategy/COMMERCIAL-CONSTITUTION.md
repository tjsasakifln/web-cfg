# Constituição comercial CONFENGE

**Decisão:** EXECUTE_NOW

**Frente:** REVENUE NOW

**Evidência esperada:** 30 dias

**Alavancas:** receita, confiança, cliente e automação

**North Star:** oportunidade comercial qualificada conectada a proposta e receita

## Tese

CONFENGE é uma casa técnica de **Engenharia, Perícias e Inteligência Técnica**.
Ela ajuda o comprador a sair de uma situação confusa para uma decisão ou prova
delimitada. B2G continua forte e protegido, mas não descreve sozinho a empresa.

O sistema não promete “fazer tudo”. Ele faz três coisas:

1. reconhece a situação pública;
2. resolve para uma oferta finita com fronteira material; ou
3. responde `NEEDS_CONTEXT` e registra GAP sem inventar competência.

Os cinco núcleos são úteis para operação, conflito, sigilo e medição. Seus nomes
não são a linguagem obrigatória da home ou das money pages. A entrada pública é
a matriz `situação → decisão → família de serviço → oferta ou GAP`.

## Red-team do backlog e dos donors

| Evidência atual | O que foi preservado | O que foi substituído ou limitado |
|---|---|---|
| #577 | uma marca; categoria guarda-chuva; B2G preservado; ART/NF quando cabíveis | “cinco núcleos públicos” virou hipótese de organização interna, não copy obrigatória |
| #578 / PR #590 | taxonomia versionada, fail-closed, ownership e inventário B2G | contrato finalizado; nomes dos núcleos não roteiam; regra nacional deixa de priorizar SC |
| #583 / PR #594 | catálogo finito, 100 demandas, GAPs, 54/54 por referência, sem preço novo | corpus sobe para 120; #602 entra com fronteira; integração de hash entre donors foi corrigida |
| #602 | escritórios e plataformas podem comprar engenharia complementar, revisão, BIM, orçamento e documentação | não há autoria arquitetônica, white-label opaco, disciplina ilimitada, SLA, capacidade ou ART universal |
| #587 | planejamento técnico para o ente é oferta distinta | não é consultoria ao licitante, ato administrativo, parecer jurídico ou garantia de certame sem questionamento |
| #588 | futura página deve consumir oferta e captura exatas | não é autoridade de catálogo e continua fora desta campanha |
| #341 | margem validada exige entregas comparáveis e margem observada | ausência de margem não veta experimento de preço materialmente autorizado pelo fundador; checkout continua separado |

Todos esses itens estavam abertos em 05-09-2026. Os PRs #590 e #594 estavam
limpos e com checks verdes, mas não integrados em `main`; por isso foram usados
como donors e red-teamados, não tratados como produção.

## Cobertura e limites

A matriz cobre construtoras, incorporadoras, desenvolvimento imobiliário,
escritórios de engenharia, escritórios e plataformas de arquitetura como
clientes de engenharia complementar, condomínios, advogados e partes,
avaliações urbanas, SST, entes públicos e empresas que licitam ou executam
contratos públicos.

Loteamento ou infraestrutura só resolve para oferta quando a interface civil,
a disciplina e a atribuição são confirmáveis. Caso contrário, termina no GAP
`GAP_ATTRIBUTION_OR_DISCIPLINE_UNCONFIRMED`.

O catálogo modela 18 ofertas novas e retém o B2G vigente por referência. Modelar
não é publicar: nenhuma das 18 está `PUBLISHABLE`, nenhuma recebeu preço público
e nenhuma habilita checkout. Nem toda capacidade merece rota ou SKU próprio.

## Atendimento nacional

Redação canônica:

> **Atendimento em todo o Brasil.** Antes de assumir responsabilidade técnica,
> confirmamos o escopo, o local da atividade, as atribuições profissionais e as
> formalidades aplicáveis — incluindo registro ou visto no Crea e ART, quando
> cabíveis.

A base oficial e os riscos de mudança estão em
[Atendimento nacional: limites de registro, visto e ART](research/confea-crea-national-practice-20260905.md).
Disponibilidade para conversar e qualificar não prova visto, registro, atribuição,
campo, logística ou aceitação da atividade.

## Preço

O contrato `CONFENGE_PRICE_GATE_PROJECTION/1.0.0` descreve, sem conceder,
estados que a governança pode autorizar:

- `FOUNDER_AUTHORIZED_EXPERIMENT`: quando confirmado pela governança, descreve
  proposta manual dentro da autorização material; não significa margem validada,
  preço público ou checkout;
- `MARGIN_VALIDATED`: exige a evidência comparável da #341; ainda não liga
  checkout;
- `PUBLICATION_AUTHORIZED`: quando concedido pela governança, permite exibição
  sob gate de captura;
- `CHECKOUT_AUTHORIZED`: depende de autorização e contratos financeiros próprios.

A projeção registra como evidência observada o comentário do fundador na #577
sobre teste de triagem técnica com piso interno de R$ 2.900 no recorte
documental/remoto. Sem pin material da governança, o estado local é `DENY`.
Campo não tem preço autorizado neste contrato. O piso não foi ligado a uma SKU,
não é tabela pública, não prova margem e não autoriza cobrança automática.

## Teste das cem repetições

O corpus contém 120 demandas sintéticas. Cada nova observação pode enriquecer a
mesma regra, oferta ou lacuna. Se cem repetições exigirem cem páginas, cem SKUs
ou cem decisões manuais idênticas, a estrutura falhou. Se melhorarem o mesmo
mapa e reduzirem `GAP_UNMAPPED`, o sistema ganhou alavancagem.

## Rollback e medição

Rollback é a reversão dos contratos, scripts e testes desta campanha. Nenhum
HTML, rota, registro público de famílias, formulário, checkout, workflow ou
produção foi alterado.

Medir por família de intenção: enquadramentos seguros, `NEEDS_CONTEXT`, GAPs,
oportunidades qualificadas aceitas pelo owner comercial, propostas e receita.
Não medir sucesso por volume de páginas, leads crus ou itens modelados.
