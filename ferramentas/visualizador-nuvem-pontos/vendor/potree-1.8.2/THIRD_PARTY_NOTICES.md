# Componentes de terceiros

Este diretório contém somente os arquivos necessários ao visualizador estático desta rota.

## Potree 1.8.2

- Origem: tag `1.8.2` do repositório oficial `potree/potree`.
- Commit da tag: `3013577379b5c8530ebca3cdc980f7585ae2320f`.
- Licença: BSD, em `LICENSE-Potree.txt`.
- Build: `npm ci --ignore-scripts` e `npm run build` no código da tag; o bundle foi minificado com Terser 5.50.0, sem source map.
- SHA-256 do bundle antes da minificação: `f7c052fd8d5a5545bffe70f57b620c464bcfa0b7d49194de9fd7759b5eb98fd9`.
- SHA-256 distribuído (`potree.min.js`): `7482303cc30bb6897c695edf935f9e2faa23acadf378fb4ba5f0b3d6babcd140`.
- Recursos distribuídos: apenas os 10 ícones e texturas requisitados pelo `Viewer` nesta rota, além do worker binário usado pela fixture.

Nota de rastreabilidade: a tag oficial é 1.8.2, embora o campo de versão interno preservado pelo upstream nesse commit reporte 1.8.0.

## jQuery 3.7.1

- Origem: https://code.jquery.com/jquery-3.7.1.min.js
- Licença: MIT, em `LICENSE-jQuery.txt`, obtida da tag oficial `jquery/jquery` 3.7.1.
- SHA-256: `fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a`.

## Tween.js

- Origem: arquivo `libs/tween/tween.min.js` distribuído com a tag oficial do Potree.
- Licença: MIT, em `LICENSE-Tween.txt`.
- SHA-256: `13ceb8b6e922d1e1f956b0a541f26e97c9328769fe42e6e6d82b7c69f7d013f9`.

## Proj4js

- Origem: arquivo `libs/proj4/proj4.js` distribuído com a tag oficial do Potree.
- Licença: MIT, em `LICENSE-Proj4js.md`.
- SHA-256: `3744bf6f4563dc03f246454cfdc0e7fdd556ef14492baf99da0bfe1563b44d8d`.

## BinaryHeap

- Origem: arquivo `libs/other/BinaryHeap.js` distribuído com a tag oficial do Potree.
- Autoria indicada no arquivo: Marijn Haverbeke, 2007, com modificação em 2013.
- Licença: MIT, em `LICENSE-BinaryHeap.txt` (o cabeçalho upstream também menciona a licença não comercial do livro como alternativa).
- SHA-256: `a77f4c6948e128d8578a2116a0003480ea05a3430cb978611ca6b4307b125a82`.

Nenhum desses arquivos é buscado em CDN ou outro domínio durante a execução.

Adaptação CONFENGE em `scripts/aec/potree/normalize-controls.py`: estilos fixos do HTML interno em folha local, contexto do botão direito por evento registrado e remoção de cantos arredondados e sombras decorativas para seguir o sistema visual CONFENGE.
- SHA-256 da folha Potree original: `541e8dafc86ba3704763c35927552b15788fc0df15581d040a1a2b16a9dcd50d`.
- SHA-256 da versão local `potree.min.js`: `7482303cc30bb6897c695edf935f9e2faa23acadf378fb4ba5f0b3d6babcd140`.
- SHA-256 da versão local `potree.css`: `de5e8aa6ad859b86ee0b3237ecb1caa5739b7a6b47c60ef3f1c909d9b7d56164`.
- SHA-256 da versão local `controls.css`: `667b18bab2caeaf9b7853d89f90a68a1f65a3fe37bb6aada65e38d172f2c0eae`.

Os hashes seguintes refletem os blobs Git com finais de linha LF, preservando os bytes usados na publicação.
- SHA-256 de `tween.min.js`: `eeb205d3d1ba5c21728424a712849a9190d61fabbf3f57b54c249aa2c4184ef8`.
- SHA-256 de `BinaryHeap.js`: `fd33ecd3327fdfc16dc316cc8f7b05b27da30388be86fae259a0f17f9e8d4417`.
- SHA-256 de `workers/BinaryDecoderWorker.js`: `bbac3e5002670a49cd78020769e21b827a1cd34fdea1d1e9753e7a724efa9f01`.
