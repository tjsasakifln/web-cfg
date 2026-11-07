# Distribuição das ferramentas BIM

O portal e os guias ficam em `bim/`. Os documentos HTML das ferramentas ficam em `bim/web/` e `bim/fotogrametria/`. O índice do site aponta o visitante para o portal e para os guias.

A montagem do site chama `node scripts/bim/publicar.cjs _site`. O pacote `aplicativo.tar.gz` contém os módulos do navegador, os scripts de compilação, as licenças, as amostras fictícias e as versões exatas das dependências. A primeira montagem usa Node 22.13 ou posterior, npm, Git e tar. O laboratório de fotogrametria compila a revisão pública de WebSfM fixada no pacote. As análises dos visitantes rodam no navegador. A VPS serve os arquivos estáticos.

Para atualizar as ferramentas, confira a nova versão no repositório CONFENGE BIM e rode `python3 scripts/bim/atualizar-fonte.py /caminho/do/checkout`. Transfira as alterações de HTML para os documentos correspondentes em `bim/`. Após `npm run build:site`, confira no artefato o catálogo, a abertura de um IFC, o OCR com uma planta de exemplo e a fotogrametria. A montagem mantém fora do repositório uma cópia do resultado por versão da fonte, publicador e plataforma.
