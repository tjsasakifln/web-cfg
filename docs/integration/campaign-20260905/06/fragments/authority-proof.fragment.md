# Fragmento — autoridade e prova nominal

Targets pertencentes à MV-02/MV-09: projeção de credenciais em cada rota, Person/ProfessionalService schema e links para `/confianca/` e perfil profissional.

## Slots a substituir

Cada candidato tem um `.proof-panel` com `data-proof-state`. Na promoção:

1. consumir o registro canônico de credenciais produzido pela MV-02;
2. projetar somente claims em estado publicável, com a mesma redação em HTML e schema;
3. exibir `source_class`, data de verificação/rechecagem e caminho de correção em linguagem legível;
4. manter fora da página qualquer claim expirado, revogado, não reproduzível ou ainda auto declarado sem essa limitação;
5. identificar profissional responsável e ART por oferta/escopo, nunca como selo genérico da empresa.

## Mínimo por rota

| Rota | Prova necessária antes de indexar | Bloqueios explícitos |
| --- | --- | --- |
| `/pericias-assistencia-tecnica/` | formação/título aplicável, registro/atribuição, redação CPTEC apenas se consulta oficial reproduzível, limites entre cadastro e nomeação | “perito do TJSC”, “perito oficial”, quantidade de trabalhos sem fonte, caso ativo, resultado |
| `/avaliacoes-imoveis/` | formação e qualificação aplicáveis, registro/atribuição, responsabilidade pelo tipo de laudo/parecer | aceitação universal, chancela, avaliação “oficial”, método/cobertura sem escopo |
| `/seguranca-trabalho/` | título de Engenheiro de Segurança do Trabalho e registro/atribuição vigentes; responsáveis por disciplinas adicionais | inferir SST de Engenharia Civil, equipe médica/laboratório/rede, PCMSO/ASO próprios, cobertura de toda especialidade |

Se a prova específica de SST não estiver pronta, `/seguranca-trabalho/` permanece `noindex` e fora do sitemap mesmo que as outras duas rotas possam avançar. A promoção é route-exact, não tudo-ou-nada por campanha.
