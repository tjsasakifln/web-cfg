# OpenTakeoff local

Origem: https://github.com/Kentucky-ai/opentakeoff/tree/5570658f4312cb006c25b471ce5da2cd9d6e9b4e

A página de medição CONFENGE oferece o ambiente como opção para abrir plantas PDF, calibrar uma referência, marcar áreas e comprimentos e baixar CSV. O fork desativa conexão, interfaces e SDKs de sincronização externa, IA e atualização comercial. As folhas publicadas seguem o sistema de controles da CONFENGE. A distribuição inicia a partir da ação de abrir a área de trabalho. As marcações são manuais e o pacote do navegador omite os componentes de aprendizado de máquina.

Os arquivos públicos ficam em `ferramentas/medir-planta-pdf/workbench/`. O arquivo `opentakeoff-source-agpl.tar.gz` contém as fontes correspondentes e a receita de build, incluindo os módulos locais, cadeado de dependências, patch, licença e `CONFENGE_RUNTIME.md`. A receita também registra a substituição do gerador de UUIDs da biblioteca Three.js pela API criptográfica do navegador. SHA-256 da fonte publicada: `36a5e6620e499bd7e9fa6a43170c174bbbb629723fab4ce807d480487aef50c6`.

O pacote publica a aplicação, o PDF de demonstração e as dependências estáticas usadas pelo navegador. A página inicial, a licença, o código-fonte e o escopo de rotas ficam no wrapper CONFENGE.

O smoke no caminho de distribuição abriu a planta de exemplo, aplicou escala 1:50, criou uma forma de aproximadamente 788 pés quadrados e confirmou o download CSV. O navegador não registrou requisições externas, falhas de execução ou violações de CSP.
