// Utilidades: datas no fuso America/Sao_Paulo, ids, imagens, autosave.
export const TZ = 'America/Sao_Paulo';

const fmtParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function partes(d = new Date()) {
  const o = {};
  for (const p of fmtParts.formatToParts(d)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}

export const pad = (n, w = 2) => String(n).padStart(w, '0');

/** ISO 8601 com offset do fuso de São Paulo, ex.: 2026-11-16T15:40:12-03:00 */
export function nowISO(d = new Date()) {
  const p = partes(d);
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((comoUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const s = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function hoje() { const p = partes(); return `${p.year}-${p.month}-${p.day}`; }
export function agoraHora() { const p = partes(); return `${p.hour}:${p.minute}`; }

function ymd(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
export function diasEntre(a, b) { return Math.round((ymd(b) - ymd(a)) / 86400000); }
export function somaDias(s, n) {
  const d = new Date(ymd(s) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export function diaSemana(s) { return s ? DIAS[new Date(ymd(s)).getUTCDay()] : '—'; }
export function fmtBR(s) { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
/** Formata um ISO (com offset) para dd/mm/aaaa hh:mm no fuso de SP */
export function fmtDataHora(iso) {
  if (!iso) return '—';
  const p = partes(new Date(iso));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Dias decorridos (contando o dia de início como dia 1) e restantes até o término. null = sem dado. */
export function diasDecorridos(cfg, data) {
  if (!cfg?.inicio || !data) return null;
  const d = diasEntre(cfg.inicio, data);
  return d < 0 ? null : d + 1;
}
export function diasRestantes(cfg, data) {
  if (!cfg?.termino || !data) return null;
  return diasEntre(data, cfg.termino);
}
export function fmtDias(n) {
  if (n == null) return '—';
  if (n < 0) return `${n} (prazo excedido)`;
  return String(n);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function slugArquivo(s) { return semAcento(s).replace(/[^A-Za-z0-9]+/g, '') || 'Obra'; }

// ---------- imagens ----------
export async function comprimirImagem(file, max = 1600, q = 0.75) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * s); h = Math.round(h * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    c.width = c.height = 0; // libera memória no iOS
    if (!blob) throw new Error('Falha ao comprimir a imagem.');
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobParaDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export function dataURLParaBlob(dataUrl) {
  const [cab, b64] = dataUrl.split(',');
  const tipo = (cab.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: tipo });
}
export function bufferParaBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- autosave ----------
const pendentes = new Set();
const ouvintes = new Set();
export function aoSalvar(fn) { ouvintes.add(fn); }
function avisa(estado) { ouvintes.forEach((f) => f(estado)); }

/** Cria um salvador com debounce. touch() agenda; flush() grava já. */
export function autosaver(fn, ms = 450) {
  let t = null;
  const s = {
    touch() { clearTimeout(t); pendentes.add(s); avisa('salvando'); t = setTimeout(() => s.flush(), ms); },
    cancel() { clearTimeout(t); t = null; pendentes.delete(s); },
    async flush() {
      clearTimeout(t); t = null;
      if (!pendentes.has(s)) return;
      pendentes.delete(s);
      try { await fn(); avisa('salvo'); } catch (e) { console.error(e); avisa('erro'); alert('Erro ao salvar: ' + e.message); }
    }
  };
  return s;
}
export async function salvarPendentes() { await Promise.all([...pendentes].map((s) => s.flush())); }
