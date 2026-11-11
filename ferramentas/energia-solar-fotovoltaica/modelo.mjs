import { mountScienceTool } from "/assets/js/science-tools.mjs";
const config = {
  "slug": "energia-solar-fotovoltaica",
  "operation": "solar",
  "fields": [
    {
      "key": "latitude",
      "label": "Latitude (°)",
      "value": -27.6
    },
    {
      "key": "longitude",
      "label": "Longitude (°)",
      "value": -48.5
    },
    {
      "key": "altitude",
      "label": "Altitude (m)",
      "value": 10
    },
    {
      "key": "tilt",
      "label": "Inclinação dos módulos (°)",
      "value": 25
    },
    {
      "key": "azimuth",
      "label": "Azimute (° a partir do norte)",
      "value": 0
    },
    {
      "key": "dcPower",
      "label": "Potência DC instalada (kWp)",
      "value": 5
    },
    {
      "key": "acPower",
      "label": "Potência AC do inversor (kW)",
      "value": 5
    },
    {
      "key": "gamma",
      "label": "Coeficiente térmico de potência (1/°C)",
      "value": -0.004
    },
    {
      "key": "losses",
      "label": "Perdas globais DC (%)",
      "value": 14
    },
    {
      "key": "albedo",
      "label": "Albedo",
      "value": 0.2
    },
    {
      "key": "weather",
      "label": "Série meteorológica CSV",
      "type": "csv",
      "value": "data;ghi;dni;dhi;temperatura;vento\n2026-01-15T11:00:00-03:00;700;600;130;27;2\n2026-01-15T12:00:00-03:00;800;650;150;28;2\n2026-01-15T13:00:00-03:00;820;680;150;29;2\n2026-01-15T14:00:00-03:00;720;620;140;30;2",
      "help": "Colunas: data ISO com fuso; GHI; DNI; DHI (W/m²); temperatura do ar (°C); vento (m/s). Até 8784 leituras em intervalos constantes de até 3 h e até 470 KiB. O exemplo é demonstrativo, não uma série climática medida."
    }
  ]
};
mountScienceTool(config);
