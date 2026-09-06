# MV-09 — revenue red-team antes da produção

Execução em 2026-09-05 nos artefatos locais, em `390×844` e `1440×1000`, sem pressupor conhecimento da estrutura interna. Critério: qualquer falha material de entendimento, confiança, ação ou canonical bloqueia a publicação.

## Veredicto transversal

- **5 segundos:** a primeira dobra diz a categoria e o valor: **“Engenharia, Perícias e Inteligência Técnica”** e **“Do problema técnico à decisão documentada.”** O complemento concretiza diagnóstico, cálculo, evidência e entregáveis.
- **Empresa e responsável:** CNPJ, razão social, Tiago Sasaki, formação em Engenharia Civil pela USP e links para método, políticas e conflitos aparecem no primeiro percurso. CREA/RNP, CPTEC e habilitação SST não são publicados enquanto a prova está retida.
- **Próximo passo:** `/servicos/` leva a uma triagem contextual. Como o submit adaptativo está retido, WhatsApp, e-mail e telefone são funcionais e a interface não finge envio.
- **Canonical:** `/servicos/` é a porta corporativa e `/servicos-obras-publicas/` preserva a oferta B2G. Ferramentas, conteúdos e ofertas B2G mantêm suas rotas exatas.
- **Confiança heterogênea:** a citação religiosa e o destaque instrumentalmente excessivo de GitHub não integram o percurso comercial. IA permanece explicada apenas em sua política própria.

## Simulação dos 12 visitantes

| Visitante | Encontra o problema e entende o que recebe? | Confia e vê prova relevante? | Próximo passo | Canonical / risco de abandono | Resultado móvel + desktop |
|---|---|---|---|---|---|
| 1. Dono de construtora privada | Sim: projetos, obra/imóvel e decisões documentadas; recebe diagnóstico, cálculo, escopo ou relatório conforme o caso. | Sim para existência, identidade, formação e método; nenhuma capacidade não provada é prometida. | Triagem em `#projetos` ou `#obra-imovel`, com canais reais. | `/servicos/`; ausência de money page específica é compensada pelo hub, sem doorway. | PASS |
| 2. Coordenador de projetos | Sim: compatibilização, projetos complementares, BIM e orçamento aparecem por problema. | Sim: método e limites antes do contato. | `/triagem-tecnica/#projetos`. | `/servicos/`; não compete com conteúdo B2G. | PASS |
| 3. Arquiteto buscando engenharia complementar | Sim: o shell usa linguagem do trabalho, não núcleos internos. | Sim; ART é tratada condicionalmente ao escopo e à jurisdição, sem promessa automática. | `/triagem-tecnica/#projetos`. | `/servicos/`. | PASS |
| 4. Incorporadora | Sim: projeto, orçamento, risco e decisão documentada ficam claros. | Sim no nível institucional comprovado; cases/resultados inexistentes não são inventados. | Triagem contextual. | `/servicos/`; rota específica fica DEFER até prova de oferta. | PASS |
| 5. Loteador / desenvolvedor | Sim: loteamentos e desenvolvimento aparecem explicitamente no hub. | Sim, com caveat nacional e definição posterior de responsabilidade técnica. | `/triagem-tecnica/#projetos`. | `/servicos/`. | PASS |
| 6. Síndico / administradora | Sim: inspeção, patologia, reforma e problema do imóvel estão explícitos. | Sim; entregável e limite são positivos antes dos caveats. | `/triagem-tecnica/#obra-imovel`. | `/servicos/`; não colide com avaliação/perícia. | PASS |
| 7. Advogado com perícia | Sim: perícia e assistência técnica aparecem, com organização de fatos, cálculo e relatório possíveis. | Sim para pessoa/empresa/método; registro profissional não comprovado não é exibido. | `/triagem-tecnica/#pericia-avaliacao`. | `/servicos/`; money page permanece retida, evitando claim frágil. | PASS |
| 8. Empresa em disputa trabalhista técnica | Sim: a situação é nomeada diretamente, sem juridiquês ou promessa de parecer jurídico. | Sim; limite entre apoio técnico e atuação jurídica é claro. | `/triagem-tecnica/#pericia-avaliacao`. | `/servicos/`. | PASS |
| 9. Comprador de avaliação | Sim: avaliação de imóvel/ativo é distinguida de perícia. | Sim no nível comprovado; escopo e responsável são confirmados na triagem. | `/triagem-tecnica/#pericia-avaliacao`. | `/servicos/`; uma entrada compartilhada não funde as intenções. | PASS |
| 10. Empresa com SST | Sim: SST aparece como necessidade, sem alegar habilitação retida. | A honestidade do limite reduz risco reputacional; prova específica ainda não publicada. | `/triagem-tecnica/#sst`. | `/servicos/`; outbound e money page bloqueados até prova. | PASS seguro |
| 11. Órgão público preparando obra | Sim: planejamento, orçamento, projeto e contratação pública são separados da oferta ao licitante. | Sim; formalidades técnicas ficam condicionadas ao escopo. | `/triagem-tecnica/#planejamento-publico`. | `/servicos/`; não compete com `/servicos-obras-publicas/`. | PASS |
| 12. Construtora B2G em first touch | Sim: entra direto no catálogo ou na rota exata de glosa, medição, aditivo, reequilíbrio etc. | Sim: oferta, entregável, limites e captura B2G foram preservados. | CTA/captura da rota exata; WhatsApp onde declarado. | `/servicos-obras-publicas/` ou landing exata; nunca home ampla por fallback. | PASS |

## Evidência visual

Os arquivos em `evidence/after/` cobrem home, serviços, confiança, especialista, triagem e B2G em móvel e desktop. A captura final foi feita após rolagem progressiva para disparar `content-visibility`, evitando interpretar conteúdo não rasterizado como espaço vazio.

## Correções produzidas pelo red-team

1. `/servicos/` deixou de redirecionar para B2G, ganhou self-canonical, sitemap, família pública e CTA funcional.
2. A home ganhou uma proposta de valor concreta e cinco entradas por situação; categoria sozinha não foi aceita como hero.
3. A triagem passou a transportar contexto público por fragmento e a personalizar os fallbacks sem PII.
4. A ferramenta privada foi retirada do critical path, do sitemap e da indexação.
5. A descrição B2G residual foi removida dos rodapés corporativos.
6. A citação religiosa injetada pelo build foi retirada por não aumentar entendimento, qualificação ou confiança de um público nacional heterogêneo.

**Resultado final:** nenhum FAIL material aberto para o critical path. As limitações restantes são fail-closed: submit adaptativo, money pages sem prova, credenciais retidas e mapping PNCP não são ativados.
