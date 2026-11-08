# CONFENGE CAD

A página usa o editor CADCraft 0.18.0 distribuído em [storytold/cadcraft](https://github.com/storytold/cadcraft/releases/tag/v0.18.0). O download acontece na construção do site. O instalador valida o SHA-256 do ZIP e publica a edição CONFENGE com as licenças MIT/Apache-2.0, NOTICE e atribuições dos componentes em `/cad/editor/licencas/`. A integração externa usa o protocolo de hospedagem documentado na mesma release. O navegador busca os recursos no domínio da Confenge.

O navegador desta versão upstream edita DXF. Um worker local usa a distribuição MIT de [acad-ts](https://github.com/node-projects/acad-ts), já instalada pela construção de `/bim/web/`, para abrir DWG e gravar DWG 2000. As licenças da distribuição BIM permanecem em `/bim/web/vendor-cad/acad-LICENSE` e `/bim/web/avisos/`. Para atualizar o editor, confira o SHA, nomes de arquivos e mensagens do host e repita os testes de abertura, edição e gravação em navegador.

Para executar a prova de conversão depois de construir o site, use `node tests/cad/roundtrip.mjs _site`. A página inclui uma planta de exemplo criada para o teste. O teste compara geometria, camadas e nomes de blocos e verifica a posição exata de uma linha após reabrir o DWG de saída. O editor salva uma primeira cópia temporária em memória para que a interface identifique omissões na importação antes de permitir uma cópia DWG. Objetos proprietários e dependências externas podem impedir a exportação. Essa verificação não certifica fidelidade de fontes, estilos, cotas associativas, sólidos ou impressão.

## Identidade do editor

A aba Início e a janela Sobre desenham no próprio canvas os arquivos de logotipo da CONFENGE, nas variantes clara e escura. Os nomes dos dispositivos de impressão no DWG e as mensagens de integração seguem a convenção da edição de origem.

Para reconstruir os módulos, use o código de `storytold/cadcraft` na revisão `32238e83c2c8bf643994132883e94bc96961f649`. Execute `python3 scripts/cad/branding/prepare.py <checkout-limpo-do-cadcraft> <caminho-absoluto-para-assets-do-site>` neste repositório. Em `apps/cadcraft-web` do checkout adaptado, use Rust 1.99.1 com o alvo `wasm32-unknown-unknown`, Trunk 0.21.14, wasm-bindgen 0.2.129 e Binaryen 123. Execute `CADCRAFT_BUILD_SHA=confenge.1 trunk build --release --locked` sem pacote adicional de fontes.

A construção do site usa os deltas de `branding/` aplicados com `zstd --patch-from`. O instalador confere os SHA-256 do módulo de origem, do delta e do módulo publicado em `branding/runtime.json`. As alterações da interface devem passar pelo teste de abrir a guia Início, consultar Sobre e retornar ao desenho, além do ciclo de gravação e reabertura em DWG.
