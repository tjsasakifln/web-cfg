# Runbook da sessão

## 1. Congelar e preparar

1. Rodar `npm run test:trust-session-protocol`.
2. Registrar o SHA exato e a URL canônica/deploy preview do mesmo SHA.
3. Copiar os dois templates para `runs/YYYY-MM-DD-NN/` como `aggregate.json` e
   `interpretation.md`; não preencher interpretação ainda.
4. Preparar árvore de navegação e captura mobile/desktop a partir do mesmo SHA.
5. Definir ordem contrabalanceada antes de receber respostas.

Antes da primeira sessão, registrar no agregado o SHA-256 da primeira viewport
da home, da árvore apresentada e do snapshot das quatro ofertas do escopo. A URL
versionada deve ser `confenge.com.br` ou um deploy preview HTTPS da CONFENGE, sem
query, fragmento ou credencial. URL local não é evidência reproduzível.

## 2. Recrutar e consentir

Executar `RECRUITMENT.md` e `CONSENT-RETENTION.md`. Triagem, agenda, contato e
consentimento ficam no store privado. O moderador só inicia depois do “sim”
explícito. Não usar analytics do site para registrar resposta individual.

## 3. Executar

Uma conclusão exige os três protocolos, na ordem atribuída. O moderador lê a
instrução congelada, não corrige e não revela critério. Notas individuais ficam
privadas e pseudonimizadas até a agregação. Sem áudio, vídeo ou transcrição.

## 4. Agregar sem PII

Somente após cinco conclusões elegíveis e consentidas:

1. preencher contagens inteiras no `aggregate.json`;
2. atestar que os consentimentos privados foram verificados;
3. calcular aprovação/reprovação pelo critério de pelo menos 80% em contagens
   inteiras (4/5 na amostra mínima), sem arredondamento;
4. manter #184 aberto para CTR/scroll e #188 aberto para comparação de cliques;
5. rodar o gate, que recalcula limites e rejeita PII/chaves individuais;
6. preencher `interpretation.md` a partir do agregado já validado;
7. revisar ambos por outra pessoa ou registrar papel do owner que revisou.

Se houver de zero a quatro conclusões, `status` permanece
`AMOSTRA_INSUFICIENTE`, `raw_aggregate` fica `null`, interpretação não é
preenchida e todas as issues ficam abertas/bloqueadas.

## 5. Atualizar issues sem falsear fechamento

Publicar manualmente em cada issue somente o resultado que lhe pertence e o
link para a pasta versionada. Não incluir PII, citação individual ou contato.
Não usar palavra-chave de fechamento automático em PR/commit enquanto a
acceptance humana e os residuais de tráfego/cliques não estiverem satisfeitos.

## 6. Retenção e rollback

Agendar os descartes privados no momento da coleta. Rodar a rotina de retenção
depois da agregação e seguir `ROLLBACK.md` se o instrumento estiver inválido.
