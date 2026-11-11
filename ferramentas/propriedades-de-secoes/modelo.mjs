import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "propriedades-de-secoes",
  "operation": "section",
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
      "key": "mesh",
      "label": "Divisões de área para a malha",
      "value": 128,
      "help": "De 16 a 512. A malha final pode ter mais elementos que esse número."
    },
    {
      "key": "warping",
      "label": "Torção e centro de cisalhamento",
      "value": "yes",
      "options": [
        [
          "yes",
          "Calcular"
        ],
        [
          "no",
          "Somente propriedades e tensões"
        ]
      ]
    },
    {
      "key": "axial",
      "label": "Força axial N (kN)",
      "value": 0
    },
    {
      "key": "momentX",
      "label": "Momento Mx (kN·m)",
      "value": 10
    },
    {
      "key": "momentY",
      "label": "Momento My (kN·m)",
      "value": 0
    }
  ]
};
config.transform = data=>({...data,vertices:data.vertices.map(p=>[p.x,p.y]),warping:data.warping==='yes'});
mountScienceTool(config);
