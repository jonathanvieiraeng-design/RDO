// Serviço do módulo RDO: criação, cópia do dia anterior, fechamento, revisões, progresso.
import * as db from './db.js';
import { nowISO, uid, pad, slugArquivo } from './util.js';
import { rovsDoDia, mapaVizinhos, resumoROV } from './rov.js';

export function nomeArquivoRDO(rdo, cfg) {
  const sigla = slugArquivo(cfg.siglaArquivo || cfg.nome);
  return `RDO_${sigla}_${rdo.data}_n${pad(rdo.numero, 3)}${rdo.rev ? '_rev' + pad(rdo.rev) : ''}.pdf`;
}

/** Última versão (maior revisão) de cada nº de RDO. */
function ultimasVersoes(lista) {
  const m = new Map();
  for (const r of lista) { const a = m.get(r.numero); if (!a || r.rev > a.rev) m.set(r.numero, r); }
  return [...m.values()];
}

export async function rdoPorData(data) {
  const l = await db.porIndice('rdos', 'data', data);
  if (!l.length) return null;
  return l.sort((a, b) => b.rev - a.rev)[0];
}
export async function versoesDe(numero) {
  return (await db.porIndice('rdos', 'numero', numero)).sort((a, b) => b.rev - a.rev);
}
export async function todasUltimasVersoes() {
  return ultimasVersoes(await db.all('rdos')).sort((a, b) => b.data.localeCompare(a.data));
}

/** Último RDO fechado antes da data (versão fechada mais recente de cada nº). */
export async function ultimoFechado(data) {
  const fechados = ultimasVersoes((await db.all('rdos')).filter((r) => r.status === 'fechado'))
    .filter((r) => r.data < data)
    .sort((a, b) => b.data.localeCompare(a.data));
  return fechados[0] || null;
}
/** Último RDO anterior à data (fechado ou não) — usado em "Repetir serviços de ontem". */
export async function ultimoAnterior(data) {
  const l = ultimasVersoes(await db.all('rdos')).filter((r) => r.data < data).sort((a, b) => b.data.localeCompare(a.data));
  return l[0] || null;
}

export async function criarRDO(data) {
  const existente = await rdoPorData(data);
  if (existente) return existente;
  const ult = await ultimoFechado(data);
  const agora = nowISO();
  const rdo = {
    id: uid(), numero: await db.proximoSeq('rdo'), rev: 0, revMotivo: '', revDe: null,
    data, status: 'aberto',
    tempo: { manha: null, tarde: null, paralisacao: null, paralisacaoObs: '' },
    efetivo: {}, subcontratadas: {}, equipamentos: {},
    servicos: [], fiscalizacao: '', ocorrencias: '', producao: '', fotos: [],
    copiadoDe: ult ? ult.id : null,
    fechadoEm: null, rovSnapshot: null, cfgSnapshot: null,
    criadoEm: agora, atualizadoEm: agora
  };
  if (ult) {
    for (const [id, e] of Object.entries(ult.efetivo || {})) if (e.presente > 0) rdo.efetivo[id] = { presente: e.presente, faltas: 0, obs: '' };
    for (const [id, s] of Object.entries(ult.subcontratadas || {})) if (s.qtd > 0) rdo.subcontratadas[id] = { qtd: s.qtd, obs: '' };
    for (const [id, q] of Object.entries(ult.equipamentos || {})) if (q.qtd > 0) rdo.equipamentos[id] = { qtd: q.qtd };
  }
  await db.put('rdos', rdo);
  return rdo;
}

export async function salvarRDO(rdo) {
  if (rdo.status === 'fechado') throw new Error('RDO fechado não pode ser alterado. Crie uma revisão.');
  rdo.atualizadoEm = nowISO();
  await db.put('rdos', rdo);
}

export function totaisEfetivo(rdo) {
  let presentes = 0, faltas = 0;
  for (const e of Object.values(rdo.efetivo || {})) { presentes += e.presente || 0; faltas += e.faltas || 0; }
  return { presentes, faltas };
}

/** Seções para o indicador de progresso. Vizinhança é automática (sempre conta). */
export function progresso(rdo) {
  const t = totaisEfetivo(rdo);
  const s = {
    tempo: !!(rdo.tempo.manha && rdo.tempo.tarde),
    efetivo: t.presentes > 0,
    subcontratadas: Object.values(rdo.subcontratadas).some((x) => x.qtd > 0),
    equipamentos: Object.values(rdo.equipamentos).some((x) => x.qtd > 0),
    servicos: rdo.servicos.some((x) => x.descricao.trim()),
    observacoes: !!(rdo.fiscalizacao.trim() || rdo.ocorrencias.trim() || rdo.producao.trim()),
    fotos: rdo.fotos.length > 0 || rdo.servicos.some((x) => x.fotos.length),
    vizinhanca: true
  };
  return { secoes: s, feitas: Object.values(s).filter(Boolean).length, total: Object.keys(s).length };
}

/** Checklist de campos vazios (apenas aviso, não bloqueia). */
export function checklist(rdo) {
  const p = [];
  if (!rdo.tempo.manha) p.push('Tempo – manhã');
  if (!rdo.tempo.tarde) p.push('Tempo – tarde');
  if (!totaisEfetivo(rdo).presentes) p.push('Efetivo – nenhum presente');
  if (!rdo.servicos.length) p.push('Serviços executados – nenhum item');
  rdo.servicos.forEach((s, i) => {
    if (!s.descricao.trim()) p.push(`Serviço ${i + 1} – sem descrição`);
    if (!s.areaId) p.push(`Serviço ${i + 1} – sem área/pavimento`);
    if (!s.situacao) p.push(`Serviço ${i + 1} – sem situação`);
  });
  if (!rdo.fiscalizacao.trim()) p.push('Observações da fiscalização');
  if (!rdo.ocorrencias.trim()) p.push('Ocorrências gerais do dia');
  if (!rdo.producao.trim()) p.push('Total de produção do dia');
  if (!rdo.fotos.length && !rdo.servicos.some((s) => s.fotos.length)) p.push('Fotos do dia – nenhuma');
  return p;
}

/** Fecha: congela configuração e ROVs do dia, gera o PDF e só então grava (se o PDF falhar, nada muda). */
export async function fecharRDO(rdo, cfg, gerarPdf) {
  const viz = await mapaVizinhos();
  const rovs = (await rovsDoDia(rdo.data)).map((r) => resumoROV(r, cfg, viz));
  const fechado = structuredClone(rdo);
  fechado.status = 'fechado';
  fechado.fechadoEm = nowISO();
  fechado.rovSnapshot = rovs;
  fechado.cfgSnapshot = structuredClone(cfg);
  const blob = await gerarPdf(fechado, fechado.cfgSnapshot);
  const nome = nomeArquivoRDO(fechado, fechado.cfgSnapshot);
  fechado.atualizadoEm = fechado.fechadoEm;
  await db.put('rdos', fechado);
  await db.put('pdfs', { id: fechado.id, blob, nome, criadoEm: nowISO() });
  Object.assign(rdo, fechado);
  return { blob, nome };
}

/** PDF guardado; se não houver (ex.: após importar backup), é regenerado a partir dos dados congelados. */
export async function pdfDoRDO(rdo, cfgAtual, gerarPdf) {
  const salvo = await db.get('pdfs', rdo.id);
  if (salvo) return salvo;
  const cfg = rdo.cfgSnapshot || cfgAtual;
  const blob = await gerarPdf(rdo, cfg);
  const reg = { id: rdo.id, blob, nome: nomeArquivoRDO(rdo, cfg), criadoEm: nowISO() };
  if (rdo.status === 'fechado') await db.put('pdfs', reg);
  return reg;
}

/** Revisão: nova versão aberta, com motivo; a versão fechada anterior fica intacta. */
export async function criarRevisao(rdo, motivo) {
  const versoes = await versoesDe(rdo.numero);
  if (versoes[0].id !== rdo.id) throw new Error('Só é possível revisar a versão mais recente.');
  if (rdo.status !== 'fechado') throw new Error('A versão atual ainda está aberta.');
  const agora = nowISO();
  const nova = structuredClone(rdo);
  Object.assign(nova, {
    id: uid(), rev: rdo.rev + 1, revMotivo: motivo, revDe: rdo.id, status: 'aberto',
    fechadoEm: null, rovSnapshot: null, cfgSnapshot: null, criadoEm: agora, atualizadoEm: agora
  });
  nova.servicos.forEach((s) => { s.id = s.id || uid(); });
  await db.put('rdos', nova);
  return nova;
}

/** Remove fotos que nenhum registro referencia (ex.: removidas antes de fechar). */
export async function limparFotosOrfas() {
  const usadas = new Set();
  for (const r of await db.all('rdos')) {
    r.fotos.forEach((f) => usadas.add(f.fotoId));
    r.servicos.forEach((s) => s.fotos.forEach((f) => usadas.add(f.fotoId)));
  }
  for (const r of await db.all('rovs')) r.fotos.forEach((f) => usadas.add(f.fotoId));
  for (const f of await db.all('fotos')) if (!usadas.has(f.id)) await db.del('fotos', f.id);
}
