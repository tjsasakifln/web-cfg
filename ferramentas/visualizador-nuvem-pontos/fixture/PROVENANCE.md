# Nuvem sintética CONFENGE

Esta fixture foi gerada deterministicamente pelo arquivo `generate-fixture.mjs`. Ela não contém levantamento, projeto, modelo, imagem ou dado de cliente.

- Sistema de coordenadas: cartesiano local, sem georreferenciamento.
- Unidade: metro.
- Caixa envolvente nominal e conferível: 12 m × 8 m × 4 m.
- Segmento de referência: A (1, 1, 0) até B (11, 1, 0), com 10 m.
- Espaçamento nominal das malhas: 0,25 m.
- Componentes: plataforma horizontal, plano inclinado demonstrativo e quatro réguas verticais.
- Formato: octree Potree 1.7 com um único nó raiz, posições quantizadas a 1 mm e cor RGBA.
- Licença: CC0 1.0 Universal, conforme `LICENSE.txt`.

Para reproduzir os binários, execute `node fixture/generate-fixture.mjs` a partir da rota. O teste da rota verifica contagem, extensões e pontos de referência diretamente no arquivo binário.
