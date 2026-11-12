# Compilação da edição CONFENGE do OpenCAD Studio

Origem fixada: `HakanSeven12/OpenCADStudio`, tag `v2026.45`, commit `fb0a667e269b6c924233ecd450a11dd7cba40eea`. A edição usa a licença GPL-3.0 e conserva as fontes e licenças correspondentes, inclusive as dependências fixadas em `Cargo.lock`.

`confenge.patch` altera a identidade, o início, o idioma padrão e a integração de exportação. Não troca os leitores, escritores ou o núcleo geométrico. Os dois arquivos de logo são gerados por `build_remote.py` a partir do PNG oficial já versionado no site, com SHA-256 obrigatório. O patch é revisável como texto e é aplicado somente ao commit de origem registrado.

A compilação utiliza Rust 1.99.1, wasm-bindgen 0.2.108 e o perfil release original, com um processo de compilação por vez. O aplicativo completo excedeu a memória de um executor com aproximadamente 10 GiB, inclusive nos ensaios com UI O1 e O0; o workflow usa o runner Linux e uma reserva de swap efêmera. Nenhum servidor de desenhos ou mudança no servidor de produção é necessário.

O workflow `build-opencad-confenge.yml` permite somente a branch `feat/cad-opencad-studio-confenge`, inclusive em acionamentos manuais, e inicia automaticamente quando seus arquivos de build mudam. Ele clona a fonte fixa, aplica o patch, gera as dependências para compilação offline, compila os dois módulos WASM e monta pacotes com partes de até 48 MiB. `manifest.json` registra os hashes das partes, arquivos e arquivos compactados completos, além do commit e dos arquivos da ponte de hospedagem.

Depois da compilação, o workflow monta uma cópia isolada de `/cad/`, instala o pacote e recalcula a política CSP para o HTML candidato. O Chrome fixado pelo contrato do site executa os testes reais de abrir, editar, salvar e reabrir DWG, além dos testes de confirmação e cancelamento de exportação. As capturas, resultados e logs ficam no artefato separado `confenge-opencad-evidence`, inclusive em caso de falha.

O commit automático inclui exclusivamente os pacotes gerados, o manifesto, `LICENSE.txt` e `NOTICE.txt`. Ele exige que a branch ainda esteja no SHA que iniciou o build e não altera a main. Os pacotes não disparam o próprio workflow novamente. A publicação continua dependendo da revisão das evidências, dos controles do site e do fluxo Netcup.

Para reproduzir no mesmo repositório, com as ferramentas fixadas instaladas e espaço de memória suficiente:

```sh
python3 scripts/cad/opencad/build/build_remote.py
```

O script requer a pasta `.cache/opencad-confenge-build` ausente e pode reaproveitar `.cache/opencad-target`. O correspondente publicado é extraído em `opencad-confenge/`, `opencad-vendor/` e `hosting/`; o script `opencad-confenge/scripts/build-confenge-web.sh` reconstrói os módulos usando as dependências incluídas. A pasta `hosting/` conserva os arquivos da ponte desta compilação e seu registro `ORIGIN.json`. A interface de hospedagem permanece em `cad/editor/{frame.htm,start.js,frame.css}` e utiliza a ponte de exportação confirmada pelo pai.
