import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "memorial-de-calculo",
  "operation": "memory",
  "fields": [
    {
      "key": "template",
      "label": "Modelo de cálculo",
      "value": "beam",
      "options": [
        [
          "beam",
          "Viga biapoiada com carga uniforme"
        ],
        [
          "axial",
          "Barra submetida a esforço axial"
        ],
        [
          "hazen",
          "Perda de carga Hazen-Williams"
        ]
      ]
    },
    {
      "key": "length",
      "label": "Comprimento (m)",
      "value": 5
    },
    {
      "key": "load",
      "label": "Carga uniforme (kN/m)",
      "value": 10,
      "when": {
        "key": "template",
        "values": [
          "beam"
        ]
      }
    },
    {
      "key": "modulus",
      "label": "Módulo E (GPa)",
      "value": 30,
      "when": {
        "key": "template",
        "values": [
          "beam",
          "axial"
        ]
      }
    },
    {
      "key": "inertia",
      "label": "Inércia (cm⁴)",
      "value": 160000,
      "when": {
        "key": "template",
        "values": [
          "beam"
        ]
      }
    },
    {
      "key": "force",
      "label": "Força axial (kN)",
      "value": 100,
      "when": {
        "key": "template",
        "values": [
          "axial"
        ]
      }
    },
    {
      "key": "area",
      "label": "Área (mm²)",
      "value": 10000,
      "when": {
        "key": "template",
        "values": [
          "axial"
        ]
      }
    },
    {
      "key": "flow",
      "label": "Vazão (L/s)",
      "value": 10,
      "when": {
        "key": "template",
        "values": [
          "hazen"
        ]
      }
    },
    {
      "key": "diameter",
      "label": "Diâmetro interno (mm)",
      "value": 100,
      "when": {
        "key": "template",
        "values": [
          "hazen"
        ]
      }
    },
    {
      "key": "coefficient",
      "label": "Coeficiente C",
      "value": 130,
      "when": {
        "key": "template",
        "values": [
          "hazen"
        ]
      }
    }
  ]
};
mountScienceTool(config);
