import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "geotecnia-cpt-estacas",
  "operation": "geotechnical",
  "fields": [
    {
      "key": "mode",
      "label": "Análise",
      "value": "cpt",
      "options": [
        [
          "cpt",
          "Normalização e classificação CPT"
        ],
        [
          "pile",
          "Resistência axial por camadas"
        ]
      ]
    },
    {
      "key": "coneArea",
      "label": "Razão de áreas do cone",
      "value": 0.8,
      "when": {
        "key": "mode",
        "values": [
          "cpt"
        ]
      }
    },
    {
      "key": "waterTable",
      "label": "Profundidade do nível d'água (m)",
      "value": 0,
      "when": {
        "key": "mode",
        "values": [
          "cpt"
        ]
      }
    },
    {
      "key": "cpt",
      "label": "Leituras CPT",
      "type": "table",
      "columns": [
        {
          "key": "depth",
          "label": "Profundidade (m)"
        },
        {
          "key": "qc",
          "label": "qc (MPa)"
        },
        {
          "key": "fs",
          "label": "fs (MPa)"
        },
        {
          "key": "u2",
          "label": "u2 (MPa)"
        },
        {
          "key": "total",
          "label": "σv total (kPa)"
        },
        {
          "key": "effective",
          "label": "σ′v (kPa)"
        }
      ],
      "value": [
        {
          "depth": 5,
          "qc": 10,
          "fs": 0.05,
          "u2": 0.05,
          "total": 100,
          "effective": 50
        },
        {
          "depth": 10,
          "qc": 15,
          "fs": 0.08,
          "u2": 0.1,
          "total": 200,
          "effective": 100
        }
      ],
      "max": 1000,
      "when": {
        "key": "mode",
        "values": [
          "cpt"
        ]
      },
      "help": "Profundidades crescentes. Tensões fornecidas pelo responsável pela interpretação."
    },
    {
      "key": "diameter",
      "label": "Diâmetro da estaca (m)",
      "value": 0.5,
      "when": {
        "key": "mode",
        "values": [
          "pile"
        ]
      }
    },
    {
      "key": "length",
      "label": "Comprimento enterrado (m)",
      "value": 10,
      "when": {
        "key": "mode",
        "values": [
          "pile"
        ]
      }
    },
    {
      "key": "factor",
      "label": "Fator global de resistência",
      "value": 2,
      "when": {
        "key": "mode",
        "values": [
          "pile"
        ]
      }
    },
    {
      "key": "layers",
      "label": "Perfil por camadas",
      "type": "table",
      "columns": [
        {
          "key": "top",
          "label": "Topo (m)"
        },
        {
          "key": "bottom",
          "label": "Base (m)"
        },
        {
          "key": "soil",
          "label": "Solo",
          "options": [
            [
              "clay",
              "Argila"
            ],
            [
              "sand",
              "Areia"
            ],
            [
              "sand-silt",
              "Areia siltosa"
            ]
          ]
        },
        {
          "key": "density",
          "label": "Compacidade da areia",
          "options": [
            [
              "Medium dense",
              "Média"
            ],
            [
              "Dense",
              "Compacta"
            ],
            [
              "Very dense",
              "Muito compacta"
            ]
          ]
        },
        {
          "key": "sigmaTop",
          "label": "σ′v topo (kPa)"
        },
        {
          "key": "sigmaBottom",
          "label": "σ′v base (kPa)"
        },
        {
          "key": "su",
          "label": "Su argila (kPa)"
        }
      ],
      "value": [
        {
          "top": 0,
          "bottom": 10,
          "soil": "clay",
          "density": "Medium dense",
          "sigmaTop": 0,
          "sigmaBottom": 100,
          "su": 50
        }
      ],
      "max": 50,
      "when": {
        "key": "mode",
        "values": [
          "pile"
        ]
      },
      "help": "Camadas contíguas a partir da superfície. Su só é usado nas argilas."
    }
  ]
};
mountScienceTool(config);
