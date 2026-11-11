import DxfParser from './vendor/dxf-parser.mjs';

// dxf-parser skips unregistered entity types silently at its default log level.
// Keep lightweight placeholders so exclusions are counted in the same traversal,
// including occurrences inside inserted blocks. ATTRIB is intentionally excluded:
// multiline attributes and instance overrides need a separate association parser.
const supported = new Set(['3DFACE','ARC','ATTDEF','CIRCLE','DIMENSION','ELLIPSE','INSERT','LINE','LWPOLYLINE','MTEXT','POINT','POLYLINE','SOLID','SPLINE','TEXT']);
const structure = new Set(['SECTION','ENDSEC','TABLE','ENDTAB','BLOCK','ENDBLK','EOF','VERTEX','SEQEND']);
export function parseDrawing(text) {
  if(typeof text!=='string'||text.length>20*1024*1024)throw Error('Escolha um DXF ASCII de até 20 MiB.');
  if(text.startsWith('AutoCAD Binary DXF'))throw Error('Converta o arquivo para DXF ASCII antes de continuar.');
  const lines=text.split(/\r\n|\n|\r/), unknown=new Set();
  for(let i=0;i+1<lines.length;i+=2)if(lines[i].trim()==='0') {
    const type=lines[i+1].trim();
    if(/^[A-Z][A-Z0-9_]{0,99}$/.test(type)&&!supported.has(type)&&!structure.has(type))unknown.add(type);
  }
  const parser=new DxfParser();
  for(const type of unknown)parser.registerEntityHandler(class {
    ForEntityName=type;
    parseEntity(scanner) {
      const entity={type,layer:'0'};
      let group=scanner.next();
      while(!scanner.isEOF()&&group.code!==0) {
        if(group.code===8)entity.layer=String(group.value);
        if(group.code===5)entity.handle=group.value;
        if(group.code===67)entity.inPaperSpace=group.value===1;
        group=scanner.next();
      }
      return entity;
    }
  });
  return parser.parseSync(text);
}
