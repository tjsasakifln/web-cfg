import { generate } from '@pdfme/generator';
import { image, text } from '@pdfme/schemas';

export async function createReportPdf({ context, photos }) {
  const input = {
    brand: 'CONFENGE · Registro de campo',
    title: 'RELATÓRIO FOTOGRÁFICO DE VISTORIA',
    placeLabel: 'LOCAL', place: context.place, dateLabel: 'DATA', date: context.date,
    authorLabel: 'REGISTRO', author: context.author, purposeLabel: 'OBJETIVO', purpose: context.purpose,
    footer: 'CONFENGE · Relatório montado localmente no navegador · confenge.com.br',
  };
  const label = (name, x, y, width, height, fontSize = 10) => ({
    name, type: 'text', position: { x, y }, width, height, fontSize, fontColor: '#152530',
    alignment: 'left', verticalAlignment: 'top',
  });
  const schemas = [[
    label('brand', 15, 18, 180, 8, 9, true), label('title', 15, 39, 180, 20, 20, true),
    label('placeLabel', 15, 74, 40, 7, 8, true), label('place', 15, 82, 180, 10, 11),
    label('dateLabel', 15, 102, 40, 7, 8, true), label('date', 15, 110, 180, 10, 11),
    label('authorLabel', 15, 130, 60, 7, 8, true), label('author', 15, 138, 180, 10, 11),
    label('purposeLabel', 15, 166, 60, 7, 8, true), label('purpose', 15, 174, 180, 56, 11),
    label('footer', 15, 278, 180, 7, 7),
  ]];
  for (const [index, photo] of photos.entries()) {
    input[`heading${index}`] = `FOTO ${index + 1}`;
    input[`caption${index}`] = photo.caption || 'Legenda a preencher';
    input[`photo${index}`] = photo.dataUrl;
    schemas.push([
      label(`heading${index}`, 15, 16, 180, 9, 11, true),
      { name: `photo${index}`, type: 'image', position: { x: 15, y: 33 }, width: 180, height: 180, contentMode: 'fit' },
      label(`caption${index}`, 15, 224, 180, 38, 10), label('footer', 15, 278, 180, 7, 7),
    ]);
  }
  return generate({
    template: { basePdf: { width: 210, height: 297, padding: [0, 0, 0, 0] }, schemas },
    inputs: [input], plugins: { text, image },
    options: { title: `Relatório fotográfico — ${context.place}`, author: 'CONFENGE', creator: 'CONFENGE', subject: 'Registro fotográfico de vistoria', lang: 'en' },
  });
}
