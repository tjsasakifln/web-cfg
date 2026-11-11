import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "trelicas-e-porticos",
  "operation": "frame",
  "fields": [
    {
      "key": "kind",
      "label": "Tipo de estrutura",
      "value": "frame",
      "options": [
        [
          "frame",
          "Pórtico plano"
        ],
        [
          "truss",
          "Treliça plana"
        ]
      ]
    },
    {
      "key": "analysis",
      "label": "Análise",
      "value": "linear",
      "options": [
        [
          "linear",
          "Elástica linear"
        ],
        [
          "pdelta",
          "Segunda ordem P-Delta"
        ]
      ]
    },
    {
      "key": "elastic",
      "label": "Módulo E (GPa)",
      "value": 200
    },
    {
      "key": "poisson",
      "label": "Coeficiente de Poisson",
      "value": 0.3
    },
    {
      "key": "area",
      "label": "Área das barras (cm²)",
      "value": 100
    },
    {
      "key": "inertia",
      "label": "Inércia das barras (cm⁴)",
      "value": 10000
    },
    {
      "key": "factor",
      "label": "Fator da combinação",
      "value": 1
    },
    {
      "key": "nodes",
      "label": "Nós e apoios",
      "type": "table",
      "columns": [
        {
          "key": "id",
          "label": "Nó",
          "type": "text"
        },
        {
          "key": "x",
          "label": "x (m)"
        },
        {
          "key": "y",
          "label": "y (m)"
        },
        {
          "key": "support",
          "label": "Apoio",
          "options": [
            [
              "free",
              "Livre"
            ],
            [
              "fixed",
              "Engaste"
            ],
            [
              "pin",
              "Articulação"
            ],
            [
              "rollerY",
              "Restringe Y"
            ],
            [
              "rollerX",
              "Restringe X"
            ]
          ]
        }
      ],
      "value": [
        {
          "id": "A",
          "x": 0,
          "y": 0,
          "support": "fixed"
        },
        {
          "id": "B",
          "x": 3,
          "y": 0,
          "support": "free"
        }
      ],
      "max": 50,
      "blank": {
        "id": "C",
        "x": 0,
        "y": 0,
        "support": "free"
      }
    },
    {
      "key": "members",
      "label": "Barras e liberações de momento",
      "type": "table",
      "columns": [
        {
          "key": "id",
          "label": "Barra",
          "type": "text"
        },
        {
          "key": "start",
          "label": "Nó inicial",
          "type": "text"
        },
        {
          "key": "end",
          "label": "Nó final",
          "type": "text"
        },
        {
          "key": "releaseStart",
          "label": "Rótula inicial",
          "options": [
            [
              "no",
              "Não"
            ],
            [
              "yes",
              "Sim"
            ]
          ]
        },
        {
          "key": "releaseEnd",
          "label": "Rótula final",
          "options": [
            [
              "no",
              "Não"
            ],
            [
              "yes",
              "Sim"
            ]
          ]
        }
      ],
      "value": [
        {
          "id": "M1",
          "start": "A",
          "end": "B",
          "releaseStart": "no",
          "releaseEnd": "no"
        }
      ],
      "max": 80
    },
    {
      "key": "loads",
      "label": "Forças e momentos nodais",
      "type": "table",
      "columns": [
        {
          "key": "node",
          "label": "Nó",
          "type": "text"
        },
        {
          "key": "fx",
          "label": "Fx (kN)"
        },
        {
          "key": "fy",
          "label": "Fy (kN)"
        },
        {
          "key": "mz",
          "label": "Mz (kN·m)"
        }
      ],
      "value": [
        {
          "node": "B",
          "fx": 0,
          "fy": -10,
          "mz": 0
        }
      ],
      "max": 100
    },
    {
      "key": "distributed",
      "label": "Cargas verticais distribuídas",
      "type": "table",
      "columns": [
        {
          "key": "member",
          "label": "Barra",
          "type": "text"
        },
        {
          "key": "wyStart",
          "label": "qy inicial (kN/m)"
        },
        {
          "key": "wyEnd",
          "label": "qy final (kN/m)"
        }
      ],
      "value": [],
      "max": 80,
      "help": "Forças globais positivas para cima. Todas as barras usam o mesmo material e seção."
    }
  ]
};
config.transform = data=>({...data,members:data.members.map(m=>({...m,releaseStart:m.releaseStart==='yes',releaseEnd:m.releaseEnd==='yes'}))});
mountScienceTool(config);
