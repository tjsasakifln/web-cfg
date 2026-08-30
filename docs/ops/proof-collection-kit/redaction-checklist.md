# Checklist de redação (redaction)

Marcar cada item antes de qualquer rascunho público. Se um item falhar,
a prova permanece privada.

## Identidade

- [ ] Nome do cliente, marca e logotipo ausentes
- [ ] Nomes de pessoas, e-mails, telefones e WhatsApp ausentes
- [ ] CNPJ, CPF e inscrições ausentes
- [ ] Endereço de obra, canteiro ou sede ausentes

## Contrato

- [ ] Número de contrato, processo, edital e órgão identificável ausentes
- [ ] Valores comerciais fora do escopo autorizado ausentes
- [ ] Anexos brutos (PDF, planilha, foto com placa) fora do git e do HTML

## Afirmações

- [ ] Cada fato tem fonte no recibo privado
- [ ] Resultado não verificável está UNKNOWN, sem número inventado
- [ ] Método não é apresentado como resultado de cliente
- [ ] Sem Review, AggregateRating, estrela, NPS ou depoimento

## Publicação

- [ ] Classe de permissão: consented ou redacted, nunca demonstrativo disfarçado
- [ ] Autorização ativa e dentro da expiração
- [ ] Hash do HTML bate com a aprovação humana
- [ ] URL candidata só em `/casos/<proof-id>/` depois do gate verde
