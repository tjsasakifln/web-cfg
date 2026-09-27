# Pesquisa de intenção SST — 2026-09-26

Pesquisa executada em 26/09/2026 para decidir a arquitetura comercial da campanha. Não foram usados nem estimados volumes de busca. Os resultados abaixo são observações de SERP web, não posições geolocalizadas nem dados do Google Search Console.

## Consultas e leitura de intenção

| Consulta | Resultados observados | Intenção dominante |
| --- | --- | --- |
| `"elaboração de PGR" segurança do trabalho` | MTE/gov.br, Ucaju e prestadores como Biofire, Prezervare, ISW, Primal e VES | Contratar um PGR inicial para empresa, com Inventário de Riscos e Plano de Ação. |
| `"revisão" "atualização" PGR NR-01` | MTE/gov.br, FAQ oficial, Amestra, Bplan, Ius Natura e publicações técnicas | Verificar e corrigir um PGR existente após mudança, acidente/doença, inadequação de controles ou requisito legal. |
| `PGR NR-18 obras` | MTE/gov.br, NR-18, FAQ GRO/PGR, DDS Online e Seconci-Rio | Resolver PGR e documentação do canteiro conforme fase, métodos e requisitos próprios da obra. |
| `"terceirização" "documentação SST" remoto` | Resultados dispersos de medicina/SST, outsourcing e gestão documental, sem uma landing dominante que reúna os quatro termos | Obter capacidade operacional recorrente sem manter toda a produção documental internamente. Esta leitura é uma inferência comercial, não uma categoria normativa. |

## Fontes oficiais usadas como limite factual

- [Programa de Gerenciamento de Riscos, MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/pgr): composição mínima, obrigação, revisão contínua e gatilhos do PGR.
- [FAQ oficial GRO/PGR da NR-01, MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/pgr/faq-perguntas-e-respostas-gro-e-pgr-da-nr-01.pdf): obras curtas continuam exigindo PGR e a gestão pode ocorrer por canteiro, unidade, setor ou atividade.
- [NR-18 atualizada, MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-18-atualizada-2025-1.pdf): PGR obrigatório no canteiro e documentos próprios da obra.

## Decisão de arquitetura e canibalização

As quatro rotas BOFU representam estados de compra diferentes:

1. **Elaboração de PGR:** o comprador ainda não tem o programa e quer a entrega inicial.
2. **Revisão ou atualização:** já existe PGR; a necessidade é verificar mudanças e produzir a versão revisada.
3. **PGR e SST para obras:** a entidade principal é o canteiro e sua fase, com recorte NR-18 e documentação própria.
4. **Terceirização documental:** a necessidade é capacidade operacional recorrente ou represada, com limites claros para atividades de campo e atos médicos.

Para evitar canibalização, cada rota recebeu title, H1, CTA, canonical autorreferente e caso de uso primário próprios. O hub `/seguranca-trabalho-apoio-tecnico/` compara e distribui as intenções; não substitui as landings. Links cruzados aparecem apenas como casos relacionados. A promessa remota não substitui inspeção, ensaio, medição, participação ou responsabilidade que o caso concreto exija.
