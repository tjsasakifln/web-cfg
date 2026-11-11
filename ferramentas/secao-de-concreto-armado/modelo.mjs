import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "secao-de-concreto-armado",
  "operation": "concrete",
  "fields": [
    {
      "key": "vertices",
      "label": "Contorno externo, na ordem dos vértices",
      "type": "table",
      "columns": [
        {
          "key": "x",
          "label": "x (mm)"
        },
        {
          "key": "y",
          "label": "y (mm)"
        }
      ],
      "value": [
        {
          "x": 0,
          "y": 0
        },
        {
          "x": 300,
          "y": 0
        },
        {
          "x": 300,
          "y": 500
        },
        {
          "x": 0,
          "y": 500
        }
      ],
      "max": 120,
      "help": "Percorra o perímetro em sequência, sem repetir o primeiro vértice. Coordenadas em milímetros."
    },
    {
      "key": "holes",
      "label": "Furos opcionais",
      "type": "holes",
      "value": "",
      "help": "Uma linha x;y por vértice. Separe furos diferentes por uma linha em branco. Não cruze contornos."
    },
    {
      "key": "bars",
      "label": "Armaduras longitudinais",
      "type": "table",
      "columns": [
        {
          "key": "x",
          "label": "x (mm)"
        },
        {
          "key": "y",
          "label": "y (mm)"
        },
        {
          "key": "area",
          "label": "Área da barra (mm²)"
        }
      ],
      "value": [
        {
          "x": 50,
          "y": 50,
          "area": 314
        },
        {
          "x": 250,
          "y": 50,
          "area": 314
        },
        {
          "x": 50,
          "y": 450,
          "area": 314
        },
        {
          "x": 250,
          "y": 450,
          "area": 314
        }
      ],
      "max": 80,
      "help": "Informe o centro e a área de cada barra, sem sobreposição e dentro do concreto."
    },
    {
      "key": "mode",
      "label": "Análise",
      "value": "interaction",
      "options": [
        [
          "interaction",
          "Diagrama de interação N-M"
        ],
        [
          "biaxial",
          "Interação biaxial para N fixo"
        ],
        [
          "curvature",
          "Momento-curvatura para N fixo"
        ]
      ]
    },
    {
      "key": "fc",
      "label": "Resistência do concreto (MPa)",
      "value": 30
    },
    {
      "key": "ec",
      "label": "Módulo do concreto (GPa)",
      "value": 30
    },
    {
      "key": "alpha",
      "label": "Coeficiente α do bloco de compressão",
      "value": 0.85
    },
    {
      "key": "gamma",
      "label": "Coeficiente γ do bloco de compressão",
      "value": 0.8
    },
    {
      "key": "epscu",
      "label": "Deformação última do concreto",
      "value": 0.0035
    },
    {
      "key": "fy",
      "label": "Tensão de escoamento do aço (MPa)",
      "value": 500
    },
    {
      "key": "es",
      "label": "Módulo do aço (GPa)",
      "value": 200
    },
    {
      "key": "epssu",
      "label": "Deformação de ruptura do aço",
      "value": 0.05
    },
    {
      "key": "theta",
      "label": "Ângulo da linha neutra (°)",
      "value": 0
    },
    {
      "key": "axial",
      "label": "Compressão axial N (kN)",
      "value": 0
    },
    {
      "key": "points",
      "label": "Pontos da curva de interação",
      "value": 24
    }
  ]
};
config.transform = data=>({...data,vertices:data.vertices.map(p=>[p.x,p.y])});
mountScienceTool(config);
