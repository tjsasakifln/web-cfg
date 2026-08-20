# Checklist humano — Google Business Profile (somente leitura)

Owner: fundador. `login_required: false`. `mutation: false`. `api_write: false`.

Este pacote não pede login, não usa a API do Google Business Profile e não muta ficha, endereço, foto ou avaliação.

## Passos (janela anônima)

1. Abrir uma janela anônima/privada. Não fazer login em conta Google. Não abrir o app Business Profile. Não autenticar em API.
2. Pesquisar no Google (deslogado): `CONFENGE`.
3. Pesquisar: `CONFENGE consultoria`.
4. Pesquisar: `Engº Tiago Sasaki`.
5. Pesquisar: `CONFENGE Florianópolis`.
6. Pesquisar: `consultoria licitações obras públicas Santa Catarina`.
7. Anotar se aparece painel de conhecimento, pacote de mapas (map-pack) ou cartão de perfil. Valores: presente / ausente / pouco claro. Não clicar em “Reivindicar esta empresa” e não clicar em “Possui este negócio?”.
8. No Google Maps (deslogado), pesquisar `CONFENGE`. Não sugerir edição. Não adicionar ficha. Não enviar foto. Não pedir avaliação.
9. Se uma ficha estiver visível, copiar só o que está público na tela (nome, telefone, site) e comparar com o contato já publicado em `data/site/brand.json`. Não editar o perfil.
10. Se nenhuma ficha estiver visível, registrar `UNKNOWN`. Uma ficha futura de área de serviço (endereço oculto) é decisão fora deste PR. Não inventar rua, CEP, horário de loja nem review markup.

## Proibições (permanecem proibições)

- Não fazer login.
- Não usar GBP API / `posts.upsert` / write.
- Não reivindicar listing.
- Não adicionar endereço de rua.
- Não pedir avaliações.
- Não publicar foto.
- Não tratar ausência de ficha como zero de demanda.
