# CONFENGE CAD

O editor principal de `/cad/` usa a edição CONFENGE do [OpenCAD Studio v2026.45](https://github.com/HakanSeven12/OpenCADStudio/releases/tag/v2026.45), fixada no commit `fb0a667e269b6c924233ecd450a11dd7cba40eea`. O leitor, o editor e o gravador DWG/DXF são os do OpenCAD Studio. A página não converte os desenhos pelo motor anterior.

O aplicativo Rust é compilado para WebAssembly com um worker local para leitura e gravação. A edição inclui a marca CONFENGE dentro do canvas, idioma inicial português brasileiro, preferências próprias e integração com a carteira existente do site. Os oito aplicativos de `/cad/aplicativos/` têm instalador independente e continuam disponíveis.

## Instalação e procedência

`publicar.py` instala o pacote local de `opencad/` durante a construção canônica do site. `manifest.json` registra a origem, a versão da edição, os hashes de cada parte dos arquivos compactados e os hashes dos recursos de execução. O instalador recusa arquivos ausentes, corrompidos ou inesperados, caminhos fora do pacote, links e entradas duplicadas. Não baixa um editor de uma revisão móvel durante o build do site.

O código correspondente inclui as alterações CONFENGE, `Cargo.lock`, as fontes das dependências e instruções de reconstrução. É publicado em `/cad/editor/licencas/corresponding-source.tar.gz`, junto com a GPL-3.0 e os avisos. O arquivo `/cad/editor/runtime.json` permite conferir a versão e a procedência do motor servido. O código de hospedagem está neste repositório, em `cad/`.

Os scripts em `opencad/build/` reconstroem o motor a partir da revisão fixada e do patch legível. O workflow `build-opencad-confenge.yml` prepara os módulos e o código correspondente em uma branch de trabalho. Ele não publica o site. A entrega de produção continua passando pelos testes e pelo processo Netcup canônico.

## Abertura e edição

A página aceita arquivos DWG e DXF locais de até 64 MiB e oferece um exemplo. A validação inicial recusa um DWG sem assinatura compatível antes de iniciar o motor. A abertura de outro arquivo usa uma nova aba nativa; uma tentativa inválida não descarta o desenho atual. Fontes ausentes e referências externas são sinalizadas quando o motor as informa.

O comando **Salvar como** abre a escolha nativa de nome, formato e versão. O motor oferece DWG/DXF R14 a 2018. Não se promete equivalência para todo objeto proprietário, fonte, vínculo ou recurso de outro aplicativo. O usuário deve conferir a cópia no fluxo de trabalho em que será utilizada.

O editor ampliado mantém a página travada, preserva o pan com botão central e permite voltar à página sem destruir a sessão. Escape atua sobre o comando de desenho e não encerra o modo ampliado.

## Confirmação de exportação

`cad/editor/start.js` registra `window.openCadStudioSaveFile(name, bytes)` antes de iniciar o motor. A função retorna `Promise<boolean>`. O pai valida a origem exata, a janela emissora, o identificador, o nome, o formato e os bytes; então chama `exportToolResult` da carteira existente. Uma resposta positiva só é enviada após a autorização e o início da entrega pelo navegador.

O Rust aguarda essa confirmação antes de marcar a versão exportada como salva ou concluir um fechamento pendente. Cancelamento, falha, ausência da ponte ou edição posterior ao snapshot preservam as alterações. Lotes aguardam cada arquivo. A API de automação não fornece um caminho de gravação que contorne esse fluxo. Autosave e recuperação continuam locais.

As mensagens usam `confenge-cad:export` e `confenge-cad:export-result`, com identificadores únicos e janela de espera de dez minutos. Pedidos simultâneos e repetidos não geram uma segunda entrega. Os formatos permitidos pelo host e pela carteira devem permanecer iguais. Os dados do desenho passam apenas entre o frame e a página do mesmo domínio; esta integração não envia desenhos para um serviço de conversão.

## Política do navegador

Os módulos, o worker, as fontes e as imagens são servidos pelo próprio site. A edição não inclui analytics externos nem registra o service worker do projeto de origem. A política de `/cad/editor/*` em `_headers` admite WebAssembly e o worker local. As referências de inicialização recebem versões derivadas de conteúdo para evitar a mistura de arquivos em cache.

## Verificação

Depois de construir o site com Node 22:

```sh
npm run test:cad
node --test tests/tools-commerce/core.test.cjs
CHROME_PATH=/usr/bin/chromium node tests/cad/editor-browser.mjs _site
```

O primeiro comando confere o protocolo entre frame e host, os hashes do pacote e a preservação da suíte de aplicativos. O teste de navegador usa os módulos reais sob as políticas do artefato publicado: abre um DWG, edita geometria, testa a navegação, grava uma cópia e a reabre. A configuração da carteira nesse teste é uma fixture explícita sem cobrança. Capturas e resultados ficam em `build/reports/cad`.

Uma mudança de motor, leitor, gravador, ponte ou política do navegador exige repetir a verificação com o WASM que será entregue. Testes de protocolo isolados não substituem a prova de abrir, editar, salvar e reabrir no editor real.

## Reversão

O rollback é a restauração da versão anterior completa pelo processo Netcup, incluindo HTML, JavaScript, WASM e políticas do navegador. Não misture o loader de uma edição com os módulos de outra. Os arquivos originais dos visitantes permanecem em seus dispositivos.
