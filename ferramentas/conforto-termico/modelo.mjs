import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "conforto-termico",
  "operation": "comfort",
  "fields": [
    {
      "key": "environments",
      "label": "Ambientes e condições",
      "type": "table",
      "columns": [
        {
          "key": "name",
          "label": "Ambiente",
          "type": "text"
        },
        {
          "key": "tdb",
          "label": "Ar (°C)"
        },
        {
          "key": "tr",
          "label": "Radiante (°C)"
        },
        {
          "key": "velocity",
          "label": "v relativa (m/s)"
        },
        {
          "key": "rh",
          "label": "UR (%)"
        },
        {
          "key": "met",
          "label": "Atividade (met)"
        },
        {
          "key": "clo",
          "label": "Vestimenta (clo)"
        },
        {
          "key": "wind10",
          "label": "Vento a 10 m (m/s)"
        }
      ],
      "value": [
        {
          "name": "Sala de exemplo",
          "tdb": 25,
          "tr": 25,
          "velocity": 0.1,
          "rh": 50,
          "met": 1.2,
          "clo": 0.5,
          "wind10": 1
        }
      ],
      "max": 100,
      "help": "Ar de 10 a 30 °C; radiante de 10 a 40 °C; velocidade relativa de 0 a 1 m/s; met de 0,8 a 4; clo de 0 a 2. Os limites internos do modelo também são verificados."
    }
  ]
};
mountScienceTool(config);
