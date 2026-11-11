import {calcular} from '../caminho-critico-obra/cronograma.js';
export const example='A;Mobilização;2;\nB;Fundações;5;A\nC;Compra da estrutura;3;A\nD;Montagem;4;B,C';
export function compareSchedules(baseline,current){
 const a=calcular(baseline),b=calcular(current),old=new Map(a.tasks.map(t=>[t.id,t])),next=new Map(b.tasks.map(t=>[t.id,t]));
 const ids=[...new Set([...a.tasks.map(t=>t.id),...b.tasks.map(t=>t.id)])];
 const rows=ids.map(id=>{const p=old.get(id),q=next.get(id);return{id,name:q?.nome||p.nome,state:!p?'Incluída':!q?'Retirada':'Mantida',baseline:p||null,current:q||null,deltaDuration:p&&q?q.duration-p.duration:null,deltaStart:p&&q?q.start-p.start:null,deltaFinish:p&&q?q.finish-p.finish:null,dependenciesChanged:Boolean(p&&q&&[...p.dependsOn].sort().join(',')!==[...q.dependsOn].sort().join(','))};});
 return{baseline:a,current:b,delta:b.duration-a.duration,rows};
}
export function delayActivity(baseline,id,days){
 const b=calcular(baseline);if(!Number.isInteger(days)||days<0||days>99999)throw Error('Informe atraso inteiro entre 0 e 99.999 dias.');
 if(!b.tasks.some(t=>t.id===id))throw Error('A atividade do evento não aparece na baseline.');
 return b.tasks.map(t=>[t.id,t.nome,t.duration+(t.id===id?days:0),t.dependsOn.join(',')].join(';')).join('\n');
}
