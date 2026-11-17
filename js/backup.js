// Backup: um único .json com todos os dados e as fotos em base64.
// Os PDFs não entram (são regenerados a partir dos dados congelados de cada RDO fechado).
import * as db from './db.js';
import { nowISO, blobParaDataURL, dataURLParaBlob, hoje } from './util.js';
import { limparCacheConfig } from './config.js';

const SIMPLES = ['config', 'meta', 'rdos', 'rovs', 'vizinhos'];

export async function gerarBackup() {
  const partes = [`{"formato":"rdo-rov-backup","versao":1,"exportadoEm":${JSON.stringify(nowISO())},"modo":${JSON.stringify(db.modoDemo() ? 'demo' : 'real')}`];
  for (const s of SIMPLES) partes.push(`,"${s}":`, JSON.stringify(await db.all(s)));
  partes.push(',"fotos":[');
  const fotos = await db.all('fotos');
  for (let i = 0; i < fotos.length; i++) {
    const { blob, ...resto } = fotos[i];
    partes.push((i ? ',' : '') + JSON.stringify({ ...resto, dataUrl: await blobParaDataURL(blob) }));
  }
  partes.push(']}');
  const blob = new Blob(partes, { type: 'application/json' });
  return { blob, nome: `backup_RDO-ROV_${db.modoDemo() ? 'DEMO_' : ''}${hoje()}.json`, fotos: fotos.length };
}

export async function marcarBackup() { await db.setMeta('ultimoBackup', nowISO()); }

export async function lerBackup(file) {
  const d = JSON.parse(await file.text());
  if (d.formato !== 'rdo-rov-backup') throw new Error('Arquivo não é um backup deste app.');
  return d;
}

export async function aplicarBackup(d) {
  const dados = { pdfs: [] };
  for (const s of SIMPLES) dados[s] = Array.isArray(d[s]) ? d[s] : [];
  dados.fotos = (d.fotos || []).map(({ dataUrl, ...r }) => ({ ...r, blob: dataURLParaBlob(dataUrl) }));
  // Garante que os sequenciais nunca fiquem abaixo do maior nº existente
  const maxRdo = Math.max(0, ...dados.rdos.map((r) => r.numero || 0));
  const maxRov = Math.max(0, ...dados.rovs.map((r) => r.seq || 0));
  const meta = new Map(dados.meta.map((m) => [m.id, m]));
  meta.set('seq_rdo', { id: 'seq_rdo', valor: Math.max(maxRdo, meta.get('seq_rdo')?.valor || 0) });
  meta.set('seq_rov', { id: 'seq_rov', valor: Math.max(maxRov, meta.get('seq_rov')?.valor || 0) });
  dados.meta = [...meta.values()];
  await db.substituirTudo(dados);
  limparCacheConfig();
  return { rdos: dados.rdos.length, rovs: dados.rovs.length, fotos: dados.fotos.length };
}
