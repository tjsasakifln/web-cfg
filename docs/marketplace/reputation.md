# Reputação profissional na CONFENGE

## Política de pontuação

O índice tem cinco limites inicialmente fixados em 40 pontos para serviços, 30 para acervo técnico, 15 para experiência, 10 para formação e 5 para atualização. O serviço calcula os pontos no servidor. A política JSON aceita ajustes por configuração privada e exige uma versão nova para alterar parâmetros já usados. A tabela de políticas registra a fórmula e seu SHA-256.

| Modalidade CREA | Peso inicial |
| --- | ---: |
| CAT com atestado registrado | 5 |
| CAT sem atestado | 3 |
| ART isolada com execução demonstrada | 1 |

O revisor confirma atividade, pertinência por especialidade, complexidade, responsabilidade e abrangência em escala de 1 a 4. Cada nota atua como fator entre 0,25 e 1. O serviço agrupa registros pela atividade e pelos vínculos oficiais entre CAT e ART. Usa a modalidade aplicável de maior peso em cada grupo e aplica a curva `30 × peso ajustado ÷ (12 + peso ajustado)` ao total deduplicado. Um novo documento rende menos pontos que o anterior à medida que o acervo cresce. ART registrada, sem baixa, requer confirmação independente da execução. A conferência da CONFENGE mede a força da evidência e sua pertinência. [Resolução Confea 1.137/2023, texto com a alteração 1.160/2025](https://normativos.confea.org.br/Ementas/Visualizar?id=76099)

Experiências concomitantes contam uma vez por dia, pela maior pertinência demonstrada. Formação e atualização usam referências de qualificação e peso superior para cursos com avaliação. A instituição e o diploma são verificações distintas. O vínculo da CTPS orienta a conferência e a atuação técnica exige evidência complementar. [Cadastro e-MEC](https://www.gov.br/mec/pt-br/politica-regulacao-supervisao-educacao-superior/cadastro-nacional-de-cursos-e-ies) · [CTPS Digital](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/carteira-de-trabalho-digital/perguntas-frequentes)

Serviços exigem pagamento confirmado, entrega e evento de conclusão. O volume segue curva de saturação e avaliações usam média bayesiana com média inicial 4 e peso equivalente a cinco avaliações. O mesmo comprador contribui com uma avaliação independente. Prazos entram quando o vencimento e a data da entrega estão registrados. O estado atual de disputa ou devolução retira o crédito daquele serviço da projeção até nova evidência elegível, sem débito adicional. O histórico de avaliação pública existente conserva seu significado.

## Operação privada

1. Parta de `MARKETPLACE_REPUTATION_ENABLED=false` e `MARKETPLACE_REPUTATION_PUBLIC_ENABLED=false`. Aplique a migração em banco isolado e confira a matriz de testes antes de liberar a primeira flag. Preserve as tabelas na pausa ou rollback da interface.
2. A tela **Minha reputação profissional** recebe identificadores de documentos e pedidos de revisão de proprietários autenticados. Operadores conferem documentos em canal institucional reservado e acessam a análise pelo SSH administrativo e pelo contêiner de ferramentas.
3. Liste a fila com `{"action":"queue","status":"submitted"}` e consulte o caso com `{"action":"case","id":"UUID"}`. Use uma sessão administrativa reservada. Para decidir, passe um arquivo privado JSON em stdin com `id`, `reviewer`, `status` e `reason`. Para verificar, forneça também o SHA-256 do documento conferido, referência de validação e especialidades. CAT com atestado exige confirmação do registro do atestado.
4. Vincule ARTs pelo identificador oficial e escolha o mesmo ID de atividade para provas do mesmo serviço. Informe o pedido da plataforma quando a evidência corresponder àquele serviço. Se o serviço já pontuar na dimensão de contratações, o grupo de evidências vinculadas fica fora da soma de acervo. Revogação e expiração retiram pontos da projeção. A decisão permanece no histórico restrito e a pessoa titular pode pedir revisão. [LGPD, art. 20](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)

```sh
sudo ./marketplacectl run --rm -T --no-deps tools exec ./src/scripts/review-reputation.js < /CAMINHO_PRIVADO/decisao.json
```

O comando privado `{"action":"integrity","seller_id":"ID_DO_PROFISSIONAL"}` lista contratações com repetição de comprador, sequências de valores simbólicos ou concentração de notas máximas de compradores distintos. Os parâmetros fazem parte da política versionada. O resultado serve para triagem humana e o sinal, por si só, mantém a pontuação registrada.

A classificação pública usa a segunda flag. O profissional precisa ter perfil confirmado e registro com atribuições verificadas e vigência válida para a especialidade. Em buscas específicas, o índice usa aquela especialidade. Novos profissionais participam com a qualificação documental em primeiro lugar e o desempenho na plataforma como critério subordinado. Os registros e a justificativa do revisor ficam privados.

Esta versão recebe referências e pedidos de análise. A custódia automatizada de arquivos privados, a política operacional de retenção após encerramento de conta e um painel web para revisores dependem de validação antes da abertura pública.
