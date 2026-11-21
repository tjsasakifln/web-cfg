// CONFENGE BIM Editor: patch conservador em STEP, sem reserializar a geometria IFC.
// Os tokens que nao forem alterados permanecem exatamente iguais aos da entrada.
// O arquivo e mantido no navegador. API independente do DOM para testes.
const MAX_BYTES = 25 * 1024 * 1024;
const ROOT_GUID = /^'[0-9A-Za-z_$]{22}'$/;
const EDITABLE_TEXT = new Set(['IFCLABEL', 'IFCTEXT', 'IFCIDENTIFIER', 'IFCDESCRIPTIVEMEASURE']);
const EDITABLE_NUMERIC = new Set(['IFCREAL', 'IFCINTEGER', 'IFCPOSITIVELENGTHMEASURE', 'IFCLENGTHMEASURE', 'IFCAREAMEASURE', 'IFCVOLUMEMEASURE', 'IFCMASSMEASURE', 'IFCTIMEMEASURE', 'IFCCOUNTMEASURE', 'IFCNUMERICMEASURE', 'IFCTHERMODYNAMICTEMPERATUREMEASURE']);
function invariant(ok, message) { if (!ok) throw new Error(message); }
function splitArgs(source, offset) {
  const parts = []; let depth = 0, quoted = false, comment = false, start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment) { if (c === '*' && next === '/') { comment = false; i++; } continue; }
    if (!quoted && c === '/' && next === '*') { comment = true; i++; continue; }
    if (c === "'") {
      if (quoted && next === "'") { i++; continue; }
      quoted = !quoted; continue;
    }
    if (quoted) continue;
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      const raw = source.slice(start, i);
      const trimLeft = raw.length - raw.trimStart().length;
      parts.push({start: offset + start + trimLeft, end: offset + i - (raw.length - raw.trimEnd().length), raw: raw.trim()});
      start = i + 1;
    }
  }
  invariant(!quoted && !comment && depth === 0, 'Lista de atributos IFC incompleta.');
  const raw = source.slice(start);
  const left = raw.length - raw.trimStart().length;
  parts.push({start: offset + start + left, end: offset + source.length - (raw.length - raw.trimEnd().length), raw: raw.trim()});
  return parts;
}
function readRecord(text, start, type, id, open) {
  let depth = 1, quoted = false, comment = false;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (comment) { if (c === '*' && next === '/') { i++; comment = false; } continue; }
    if (!quoted && c === '/' && next === '*') { i++; comment = true; continue; }
    if (c === "'") { if (quoted && next === "'") { i++; continue; } quoted = !quoted; continue; }
    if (quoted) continue;
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth === 0) {
      invariant(/^\s*;/.test(text.slice(i + 1, i + 20)), 'Registro IFC sem terminador: #' + id);
      const semicolon = text.indexOf(';', i + 1);
      return {id, type, start, end: semicolon + 1, args: splitArgs(text.slice(open + 1, i), open + 1)};
    }
  }
  throw new Error('Registro IFC interrompido: #' + id);
}
export function parseIfc(text) {
  invariant(typeof text === 'string' && text.length > 50 && text.length <= MAX_BYTES * 1.1, 'Arquivo IFC vazio ou acima de 25 MiB.');
  invariant(/^\s*ISO-10303-21\s*;/i.test(text) && /END-ISO-10303-21\s*;/i.test(text), 'Selecione um IFC STEP completo.');
  invariant(/FILE_SCHEMA\s*\(\s*\(\s*'IFC(?:2X3|4)/i.test(text), 'Esquema IFC nao reconhecido.');
  const records = new Map();
  const pattern = /^[ \t]*#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(/gim;
  let match, coveredUntil = 0;
  while ((match = pattern.exec(text))) {
    const start = match.index + match[0].indexOf('#');
    if (start < coveredUntil) continue;
    const id = Number(match[1]);
    invariant(Number.isSafeInteger(id) && id > 0 && !records.has(id), 'Identificador STEP repetido ou invalido: #' + match[1]);
    const record = readRecord(text, start, match[2].toUpperCase(), id, pattern.lastIndex - 1);
    records.set(id, record); coveredUntil = record.end; pattern.lastIndex = record.end;
  }
  invariant(records.size > 0 && records.size <= 250000, 'Arquivo com quantidade nao suportada de registros IFC.');
  return {text, records};
}
export function decodeStep(token) {
  if (!token || token === '$') return '';
  if (token.startsWith("'") && token.endsWith("'")) {
    return token.slice(1, -1).replace(/''/g, "'").replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/gi, (_, codes) => {
      if (codes.length % 4) return '';
      let out = ''; for (let i = 0; i < codes.length; i += 4) out += String.fromCharCode(parseInt(codes.slice(i, i + 4), 16));
      return out;
    });
  }
  return token;
}
export function encodeStep(value) {
  invariant(typeof value === 'string' && value.length <= 400, 'Texto deve ter ate 400 caracteres.');
  if (!value.trim()) return '$';
  let text = "'";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (char === "'") text += "''";
    else if (char === '\\') text += '\\\\';
    else if (code >= 32 && code < 127) text += char;
    else {
      const units = [];
      if (code <= 0xffff) units.push(code);
      else { const n = code - 0x10000; units.push(0xd800 + (n >> 10), 0xdc00 + (n & 0x3ff)); }
      text += '\\X2\\' + units.map(x => x.toString(16).toUpperCase().padStart(4, '0')).join('') + '\\X0\\';
    }
  }
  return text + "'";
}
function refs(token) { return [...(token || '').matchAll(/#(\d+)/g)].map(match => Number(match[1])); }
function isElement(record) {
  return record && record.args.length >= 4 && ROOT_GUID.test(record.args[0].raw) &&
    !/^IFC(?:REL|PROPERTY|QUANTITY|ELEMENTQUANTITY|OWNER|MATERIAL|CLASSIFICATION|SHAPE|REPRESENTATION)/.test(record.type) &&
    !/(?:TYPE|STYLE)$/.test(record.type);
}
function typedValue(raw) {
  const typed = /^([A-Z0-9_]+)\s*\((.*)\)$/i.exec(raw.trim());
  if (!typed) return {kind:'read-only', label:raw, value:raw};
  const kind=typed[1].toUpperCase(), inner=typed[2].trim();
  if (EDITABLE_TEXT.has(kind) && (inner === '$' || (inner.startsWith("'") && inner.endsWith("'")))) return {kind, value:decodeStep(inner), label:decodeStep(inner)};
  if (EDITABLE_NUMERIC.has(kind) && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[-+]?\d+)?$/i.test(inner)) return {kind, value:inner, label:inner};
  if (kind === 'IFCBOOLEAN' && /^\.(?:T|F)\.$/i.test(inner)) return {kind, value:inner.toUpperCase() === '.T.' ? 'true' : 'false', label:inner};
  return {kind:'read-only', label:raw, value:raw};
}
export class IfcDocument {
  constructor(text) {
    this.source = parseIfc(text);
    this.edits = new Map(); this.past = []; this.future = [];
    this.related = new Map(); this.shared = new Map();
    for (const rec of this.source.records.values()) {
      if (rec.type !== 'IFCRELDEFINESBYPROPERTIES' || rec.args.length < 6) continue;
      const targets = refs(rec.args[4].raw), psets = refs(rec.args[5].raw);
      for (const pid of psets) {
        const used = this.shared.get(pid) || new Set(); targets.forEach(id => used.add(id)); this.shared.set(pid, used);
        for (const id of targets) { const list=this.related.get(id)||[]; list.push(pid); this.related.set(id,list); }
      }
    }
  }
  get count() { return this.source.records.size; }
  get changed() { return this.edits.size > 0; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  arg(id, index) {
    const rec=this.source.records.get(Number(id));
    invariant(rec && rec.args[index], 'Atributo nao encontrado no IFC.');
    return this.edits.get(id + ':' + index) ?? rec.args[index].raw;
  }
  record(id) { return this.source.records.get(Number(id)); }
  elements() {
    return [...this.source.records.values()].filter(isElement).map(rec => ({
      id:rec.id, type:rec.type, name:decodeStep(this.arg(rec.id,2)) || rec.type.replace(/^IFC/,''),
      description:decodeStep(this.arg(rec.id,3)), guid:decodeStep(this.arg(rec.id,0))
    }));
  }
  properties(id) {
    const result = [], seen = new Set();
    for (const pid of this.related.get(Number(id)) || []) {
      if (seen.has(pid)) continue; seen.add(pid);
      const pset=this.record(pid);
      if (!pset || pset.type !== 'IFCPROPERTYSET' || pset.args.length < 5) continue;
      const group=decodeStep(this.arg(pid,2)), shared=(this.shared.get(pid)?.size || 0) > 1;
      for (const propId of refs(pset.args[4].raw)) {
        const prop=this.record(propId);
        if (!prop || prop.type !== 'IFCPROPERTYSINGLEVALUE' || prop.args.length < 4) continue;
        const tv=typedValue(this.arg(propId,2));
        result.push({id:propId, group, name:decodeStep(this.arg(propId,0)), ...tv, editable:!shared && tv.kind!=='read-only', shared});
      }
    }
    return result;
  }
  set(id, index, value) {
    const rec=this.record(id);
    invariant(rec && rec.args[index], 'Nao foi possivel localizar o atributo a editar.');
    const key=id + ':' + index;
    if (value === this.arg(id,index)) return;
    this.past.push(new Map(this.edits)); if (this.past.length > 100) this.past.shift();
    this.future=[]; if (value === rec.args[index].raw) this.edits.delete(key); else this.edits.set(key,value);
  }
  setName(id, name) {
    invariant(isElement(this.record(id)), 'Somente objetos do modelo podem ter nome editado.');
    invariant(name.length <= 200, 'O nome excede 200 caracteres.');
    this.set(id, 2, encodeStep(name));
  }
  setDescription(id, description) {
    invariant(isElement(this.record(id)), 'Somente objetos do modelo podem ter descricao editada.');
    this.set(id, 3, encodeStep(description));
  }
  setProperty(elementId, propertyId, value) {
    const allowed=this.properties(elementId).find(p=>p.id===Number(propertyId) && p.editable);
    invariant(allowed, 'Propriedade ausente, compartilhada ou nao editavel nesta versao.');
    let inner;
    if (EDITABLE_TEXT.has(allowed.kind)) inner=encodeStep(value);
    else if (allowed.kind==='IFCBOOLEAN') {
      invariant(value==='true' || value==='false', 'Escolha verdadeiro ou falso.');
      inner=value==='true'?'.T.':'.F.';
    } else {
      const number=Number(value);
      invariant(value.trim() !== '' && Number.isFinite(number), 'Informe numero valido.');
      if (allowed.kind==='IFCINTEGER') invariant(Number.isSafeInteger(number), 'Informe numero inteiro valido.');
      inner=String(number);
    }
    this.set(Number(propertyId),2,allowed.kind + '(' + inner + ')');
  }
  undo() { if (!this.canUndo) return; this.future.push(new Map(this.edits)); this.edits=this.past.pop(); }
  redo() { if (!this.canRedo) return; this.past.push(new Map(this.edits)); this.edits=this.future.pop(); }
  exportText() {
    invariant(this.changed, 'Nao ha alteracoes para exportar.');
    const patches=[];
    for (const [key, value] of this.edits) {
      const [id,idx]=key.split(':').map(Number), a=this.record(id)?.args[idx];
      invariant(a, 'Atributo nao encontrado na exportacao.');
      patches.push({start:a.start,end:a.end,value,id,idx});
    }
    patches.sort((a,b)=>b.start-a.start);
    for (let i=1; i<patches.length; i++) invariant(patches[i].end <= patches[i-1].start, 'Alteracoes sobrepostas.');
    let out=this.source.text;
    for (const p of patches) out=out.slice(0,p.start)+p.value+out.slice(p.end);
    const check=parseIfc(out);
    invariant(check.records.size===this.count, 'A exportacao alterou a quantidade de registros.');
    for (const [id, before] of this.source.records) {
      const after=check.records.get(id);
      invariant(after && after.type===before.type && after.args.length===before.args.length, 'Entidade alterada indevidamente: #' + id);
      for (let i=0;i<before.args.length;i++) {
        const expected=this.edits.get(id+':'+i)??before.args[i].raw;
        invariant(after.args[i].raw===expected, 'Diferenca inesperada no atributo #' + id + ':' + i);
      }
    }
    return out;
  }
}
export {MAX_BYTES};
