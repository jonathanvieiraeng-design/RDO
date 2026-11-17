// IndexedDB: dados e fotos (Blob). O modo demonstração usa um banco separado.
const VERSAO = 1;
export const STORES = ['config', 'meta', 'rdos', 'rovs', 'vizinhos', 'fotos', 'pdfs'];

export function modoDemo() {
  try { return localStorage.getItem('rdo-modo') === 'demo'; } catch { return false; }
}
export function definirModoDemo(on) {
  try { localStorage.setItem('rdo-modo', on ? 'demo' : 'real'); } catch { /* sem storage */ }
}
const nomeBanco = () => (modoDemo() ? 'rdo-rov-demo' : 'rdo-rov');

let dbp = null;
export function abrir() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(nomeBanco(), VERSAO);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) {
        if (d.objectStoreNames.contains(s)) continue;
        const os = d.createObjectStore(s, { keyPath: 'id' });
        if (s === 'rdos') { os.createIndex('data', 'data'); os.createIndex('numero', 'numero'); }
        if (s === 'rovs') os.createIndex('data', 'data');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Banco de dados bloqueado. Feche outras abas do app.'));
  });
  return dbp;
}

const p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function os(nome, modo = 'readonly') { return (await abrir()).transaction(nome, modo).objectStore(nome); }
function txFim(tx, val) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(val); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export async function get(s, id) { return p((await os(s)).get(id)); }
export async function all(s) { return p((await os(s)).getAll()); }
export async function porIndice(s, idx, val) { return p((await os(s)).index(idx).getAll(val)); }
export async function put(s, obj) {
  const tx = (await abrir()).transaction(s, 'readwrite');
  tx.objectStore(s).put(obj);
  return txFim(tx, obj);
}
export async function del(s, id) {
  const tx = (await abrir()).transaction(s, 'readwrite');
  tx.objectStore(s).delete(id);
  return txFim(tx);
}

/** Sequencial atômico que nunca se repete (nº do RDO, nº do ROV). */
export async function proximoSeq(nome) {
  const tx = (await abrir()).transaction('meta', 'readwrite');
  const st = tx.objectStore('meta');
  let val;
  const g = st.get('seq_' + nome);
  g.onsuccess = () => { val = (g.result?.valor || 0) + 1; st.put({ id: 'seq_' + nome, valor: val }); };
  return txFim(tx).then(() => val);
}

export async function getMeta(id) { return (await get('meta', id))?.valor; }
export async function setMeta(id, valor) { return put('meta', { id, valor }); }

/** Substitui todo o conteúdo (importação de backup), numa única transação. */
export async function substituirTudo(dados) {
  const d = await abrir();
  const tx = d.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const st = tx.objectStore(s);
    st.clear();
    for (const obj of dados[s] || []) st.put(obj);
  }
  return txFim(tx);
}
