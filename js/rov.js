// Serviço do módulo ROV (ocorrências com vizinhos).
import * as db from './db.js';
import { nowISO, hoje, agoraHora, uid, pad } from './util.js';
import { STATUS_ABERTOS, nomeItem } from './config.js';

/** Novo ROV em memória. O nº (ROV-001…) só é atribuído na primeira gravação, para não gerar buracos. */
export function novoROV(data) {
  const agora = nowISO();
  return {
    id: uid(), seq: null, codigo: null,
    data: data || hoje(), hora: agoraHora(),
    vizinhoId: null, canal: null, tipo: null, assuntoId: null,
    descricao: '', acao: '',
    status: 'Não resolvido', dataResolucao: '',
    fotos: [], historico: [], cancelado: null,
    criadoEm: agora, atualizadoEm: agora
  };
}

export async function salvarROV(rov) {
  if (!rov.seq) {
    rov.seq = await db.proximoSeq('rov');
    rov.codigo = 'ROV-' + pad(rov.seq, 3);
    rov.criadoEm = nowISO();
    rov.historico.unshift({ em: rov.criadoEm, de: null, para: rov.status, nota: 'Registro criado' });
  }
  rov.atualizadoEm = nowISO();
  await db.put('rovs', rov);
  return rov;
}

export async function mudarStatus(rov, novo, nota, dataResolucao) {
  if (novo === 'Resolvido' && !dataResolucao) throw new Error('Data de resolução obrigatória.');
  if (!rov.seq) await salvarROV(rov); // registra a criação antes da 1ª mudança de status
  const de = rov.status;
  rov.status = novo;
  rov.dataResolucao = novo === 'Resolvido' ? dataResolucao : '';
  rov.historico.push({ em: nowISO(), de, para: novo, nota: nota || '' });
  await salvarROV(rov);
}

export async function cancelarROV(rov, motivo) {
  const em = nowISO();
  rov.cancelado = { em, motivo };
  rov.historico.push({ em, de: rov.status, para: 'Cancelado', nota: motivo });
  await salvarROV(rov);
}

export async function listarROVs() {
  const l = await db.all('rovs');
  return l.sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')) || (b.seq - a.seq));
}
export async function rovsDoDia(data) {
  const l = await db.porIndice('rovs', 'data', data);
  return l.sort((a, b) => (a.hora || '').localeCompare(b.hora || '') || a.seq - b.seq);
}
export const estaAberto = (r) => !r.cancelado && STATUS_ABERTOS.includes(r.status);
export async function contarAbertos() { return (await db.all('rovs')).filter(estaAberto).length; }

export function filtrar(lista, f) {
  return lista.filter((r) => {
    if (!f.cancelados && r.cancelado) return false;
    if (f.ini && r.data < f.ini) return false;
    if (f.fim && r.data > f.fim) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.vizinhoId && r.vizinhoId !== f.vizinhoId) return false;
    if (f.assuntoId && r.assuntoId !== f.assuntoId) return false;
    return true;
  });
}

export async function mapaVizinhos() {
  const m = new Map();
  for (const v of await db.all('vizinhos')) m.set(v.id, v);
  return m;
}
export async function salvarVizinho(v) {
  const agora = nowISO();
  if (!v.id) { v.id = uid(); v.criadoEm = agora; }
  v.atualizadoEm = agora;
  await db.put('vizinhos', v);
  return v;
}

/** Cópia "congelada" do ROV para dentro do RDO fechado (rastreabilidade). */
export function resumoROV(r, cfg, vizinhos) {
  const v = vizinhos.get(r.vizinhoId);
  return {
    id: r.id, codigo: r.codigo, data: r.data, hora: r.hora,
    vizinho: v?.nome || '', endereco: v?.endereco || '',
    canal: r.canal, tipo: r.tipo, assunto: nomeItem(cfg, 'assuntos', r.assuntoId),
    status: r.status, descricao: r.descricao, acao: r.acao,
    cancelado: r.cancelado ? r.cancelado.motivo : null
  };
}

/** Apaga o ROV sem deixar rastro: registro, fotos e o resumo guardado nos RDOs. Se era o último nº, ele volta a ficar livre. */
export async function apagarROV(rov) {
  await db.del('rovs', rov.id);
  for (const f of rov.fotos || []) await db.del('fotos', f.fotoId);
  if (rov.seq) {
    const seq = await db.getMeta('seq_rov');
    if (seq === rov.seq) await db.setMeta('seq_rov', seq - 1);
  }
  for (const r of await db.all('rdos')) {
    if (!r.rovSnapshot?.some((x) => x.id === rov.id)) continue;
    r.rovSnapshot = r.rovSnapshot.filter((x) => x.id !== rov.id);
    if (r.status === 'gerado' || r.status === 'fechado') r.alteradoAposPdf = true;
    await db.del('pdfs', r.id);
    await db.put('rdos', r);
  }
}
