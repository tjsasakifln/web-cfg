# Gate público de conflitos — versão 1.1.0

Contrato operacional de triagem conservadora da CONFENGE, mantido pela campanha MV-02 para a issue #585. O registro executável está em `data/site/conflict-gate-contract.json`.

Esta triagem não conclui, por si só, que uma atividade privada seja compatível com função pública. Mudança de papel, dever, regra aplicável ou fato relevante exige nova análise.

## Separação de dados

| Camada | Conteúdo permitido | Responsável |
| --- | --- | --- |
| Página pública | critérios, áreas cobertas, perguntas sem identificação, resultado neutro e próximo passo | `web-cfg`, em `/conflitos/` |
| Decisão protegida | responsável, data, classe de motivo, referência interna, papel, validade, medida e recibo | governança/Warmbly; integração ainda não implementada |
| Evidência do caso | partes, processo, contrato, órgão, profissionais, documentos e motivo detalhado | registro protegido, nunca analytics |

`web-cfg` não armazena partes nem casos. A primeira etapa funciona apenas no navegador e não faz envio de formulário.

## Estados e regra de segurança

Estados internos: `CLEAR`, `CLEAR_WITH_DISCLOSURE`, `REVIEW_REQUIRED`, `DECLINE` e `UNKNOWN`.

- informação insuficiente nunca vira liberação;
- indisponibilidade do canal protegido nunca libera documentos;
- reversão ou divergência de versão retorna para revisão humana;
- dever público no mesmo objeto leva à recusa;
- perito nomeado pelo juízo e assistente técnico são papéis incompatíveis no mesmo caso ou em caso relacionado.

## Projeção pública

A projeção contém apenas estado, próximo passo, versão, indicação de suspensão do canal e resumo público. Classe de motivo, partes, número de processo, contrato, órgão e detalhes não saem da camada protegida e não entram em analytics.

## Integridade e rollback

`content_sha256` sela o JSON sem incluir o próprio campo. Versão ou hash divergente falha de modo conservador. Para rollback, restaurar contrato, página e runtime da mesma versão em conjunto; nunca manter página e intérprete com versões diferentes.

Implementação de referência: `scripts.site.conflict_gate.evaluate_conflict`. Cobertura: `scripts/site/test_conflict_gate.py` e `scripts/site/fixtures/conflict-gate/eight-cases.v1.json`.
