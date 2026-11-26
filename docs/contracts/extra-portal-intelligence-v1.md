# Radar de licitações da Extra — contrato privado

**EXECUTE_NOW**, frente Inteligência de Mercado, alavancas cliente, dados e
confiança. Decisão apoiada: selecionar o que conferir antes de comprometer horas
de orçamento, acompanhar compradores e documentar uma referência de proposta.
Dono dos fatos e da projeção: `extra-cli`, `confenge.extra-intelligence/v1`.
Dono da política de consumo do cliente: `web-cfg`. Sem área pública,
analytics ou alteração de identidade. Mantém ADR-STRAT-002 e RUNTIME-AUTHORITY.

## Regras que protegem a decisão

- Somente a sessão do cliente EXTRA, também para CSV. Intranet e visitante não
  consultam o produtor. O navegador não recebe credencial, payload bruto,
  documento materializado, chave de revisão ou nome do revisor.
- A lista só aceita obra física revisada com evidência documental de **todos**
  os locais. A execução ocorre em SC e no raio de 200 km em linha reta da sede
  de São José (IBGE 4216602, -27.62/-48.63). O código IBGE vem do documento de
  execução ou de sua validação, não do endereço administrativo da fonte.
- Município integralmente dentro do raio pode ser comprovado por código e
  documento da obra. Município cortado pelo limite exige coordenada
  corroborada, dentro da malha municipal, com incerteza e margem de segurança.
  Obras em mais de um local só entram quando todos atendem à regra. Não
  recortar artificialmente um lote misto para parecer elegível. Referências:
  [mapa da sede](https://geoftp.ibge.gov.br/cartas_e_mapas/mapas_para_fins_de_levantamentos_estatisticos/censo_demografico_2022/mapas_municipais_estatisticos/SC/sao_jose_4216602/sao_jose_4216602_mme_a0.pdf)
  e [malha do IBGE](https://servicodados.ibge.gov.br/api/v3/malhas/estados/42?formato=application%2Fvnd.geo%2Bjson&qualidade=maxima&intrarregiao=municipio).
  O gerador `scripts/portal/derive-extra-sc-geography.py` reproduz o recorte a
  partir da malha oficial, com o SHA-256 nos metadados e margem de
  arredondamento. Nenhum geocoder externo é chamado pelo portal.
- Edital aberto exige janela de proposta válida, estado `open` e verificação
  com no máximo 24 horas. Suspensão, abertura futura, prorrogação não
  comprovada e edital sem prazo não são interpretados por inferência. A
  verificação é recalculada a cada leitura. Vigência até 180 dias exige
  contrato ativo confirmado, documento com a data, ausência de conflito e
  atualização da evidência de até sete dias. Vencimento não implica edital.
- Objeto semelhante por família é ponto de partida, não equivalência técnica.
  Valor consolidado sem natureza comprovada fica como não informado. Nenhuma
  média, preço por unidade, deságio, taxa de vitória ou habilitação automática.
- Uma projeção com corte acima de 30 minutos deixa apenas o histórico com
  rótulo de atraso. Falha de leitura ou versão incompatível recolhe a aba de
  decisão sem afetar Solicitações e Documentos. Na interface, a fonte é
  **CONFENGE**. Fatos têm link e referência ao documento de origem.
- A exportação refeita pelo servidor exige a revisão exata (inclui filtros e
  estado derivado com o relógio). Mudança de carga, prazo, verificação ou filtro
  retorna 409 e pede nova consulta. Células são escapadas e neutralizadas contra
  fórmulas, inclusive quando há caracteres invisíveis antes do operador.

## Aceite de produção

Testar separadamente decisões positivas e o que ficou pendente. Provar no
release o isolamento de sessão, a troca atômica, a leitura como conta do
runtime, os estados com e sem carga, a reconciliação entre tela e CSV e uma
amostra de documentos oficiais. A auditoria de cobertura deve recuperar
possíveis omissões por estrato (sem palavras sugeridas, ente fora de SC mas obra
em SC, anúncios sem prazo, localização limítrofe e dados de lotes mistos).
Não converter uma amostra, uma fila vazia ou um timer em prova de mercado
coberto ou tempo real. Medir o atraso entre fonte persistida, corte e
apresentação antes de anunciar uma latência.

A rota usa a configuração privada `EXTRA_PORTAL_INTELLIGENCE_PATH`, sem
alterar o armazenamento do portal. A publicação do site continua pelo release
canônico de Netcup após a PR 903. Para rollback isolado, retirar a variável do
runtime e reiniciar o serviço. Para rollback completo, usar o controlador
canônico. Não modificar a base da Extra nem as sessões da PR 903.
