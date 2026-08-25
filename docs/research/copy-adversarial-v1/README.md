# Revisão adversarial da comunicação: instrumento v1

Este pacote executa a parte operacional de #338 sem declarar revisão humana.
O catálogo público já expõe as 15 cláusulas editoriais para 54/54 entregáveis,
e o gate derivado do registro comprova cobertura e diferenciação estrutural. As
oito lentes e os testes de 3 segundos, 30 segundos e 3 minutos continuam
`NOT_STARTED` até existirem revisores e participantes reais.

## Preparação

1. Rodar `node scripts/commercial/copy_contract_audit.mjs` no SHA avaliado.
2. Confirmar 54 entregáveis, 810 cláusulas e zero violação de linguagem.
3. Copiar `review.template.json` uma vez por entregável, preenchendo o
   `deliverable_id` antes de iniciar a revisão.
4. Congelar o SHA, a URL HTTPS e a ordem das ofertas vizinhas.

## Oito lentes

Cada lente registra defeito, severidade, correção e rechecagem. `NONE` significa
que nenhum defeito foi encontrado e exige justificativa concreta. Não preencher
o template com conclusão automática do scanner: máquina mede cobertura,
palavras, termos e unicidade; não julga competência, clareza ou confiança.

O gate de publicação é zero bloqueante e zero material. Defeito cosmético pode
seguir somente com owner e prazo explícitos. Confusão entre ofertas ajusta copy
ou fronteira; nunca funde nem remove item do rol cumulativo.

## Teste sem título

O precheck de máquina confirma 54 assinaturas distintas de trigger, decisão e
saída. O resultado humano usa `differentiation.template.json`: o revisor recebe
o trio sem título nem preço e escolhe o identificador. A meta 54/54 só é marcada
depois de respostas reais; assinatura distinta não equivale a compreensão.

## Privacidade e evidência

Recrutamento, consentimento, fala literal e notas individuais seguem os limites
do pacote `market-fit-v1` e ficam no store privado. O repositório recebe apenas
contagens agregadas, defeitos editoriais sem identidade e decisões de copy. Não
publicar cliente, caso, logo ou citação sem #249/#328.

