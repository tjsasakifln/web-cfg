import { getPosition } from './vendor/suncalc-2.1.2.js';

const RAD = Math.PI / 180;

export function geometria(alturaSolar, azimuteSolar, fachada, vao, distancia, avanco) {
  if (alturaSolar <= 0) return { estado: 'Noite' };
  const incidencia = Math.cos((azimuteSolar - fachada) * RAD);
  if (incidencia <= 1e-9) return { estado: 'Sem sol direto' };
  const tangentePerfil = Math.tan(alturaSolar * RAD) / incidencia;
  const alturaSombreada = Math.min(vao, Math.max(0, avanco * tangentePerfil - distancia));
  return {
    estado: 'Sol na fachada',
    fracao: alturaSombreada / vao,
    perfil: Math.atan(tangentePerfil) / RAD,
    minimo: (distancia + vao) / tangentePerfil
  };
}

export function simular(dados, hora) {
  const local = new Date(dados.data + 'T' + hora + ':00Z');
  const instante = new Date(local.getTime() - dados.fuso * 3600000);
  const { altitude, azimuth } = getPosition(instante, dados.latitude, dados.longitude);
  return {
    hora, altitude, azimuth,
    ...geometria(altitude, azimuth, dados.fachada, dados.vao, dados.distancia, dados.avanco)
  };
}

// Round the required projection UP to the next centimetre.
export const paraCentimetro = metros => Math.ceil(metros * 100 - 1e-10) / 100;
