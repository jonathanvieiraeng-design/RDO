// Entrada do app: roteador por hash, abas, service worker, persistência.
import * as db from './db.js';
import { h } from './ui.js';
import { salvarPendentes, aoSalvar } from './util.js';
import { contarAbertos } from './rov.js';
import { limparFotosOrfas } from './rdo.js';
import { semearDemo } from './demo.js';
import { viewHoje, viewRdoDetalhe } from './views/hoje.js';
import { viewHistorico } from './views/historico.js';
import { viewVizinhos, viewRovEditor, viewCadastroVizinhos } from './views/vizinhos.js';
import { viewAjustes, viewLista } from './views/ajustes.js';

const D = '(\\d{4}-\\d{2}-\\d{2})';
const ROTAS = [
  [new RegExp(`^#/hoje(?:/${D})?$`), (m) => viewHoje(m[1])],
  [/^#\/rdo\/([\w-]+)$/, (m) => viewRdoDetalhe(m[1])],
  [/^#\/historico$/, () => viewHistorico()],
  [/^#\/vizinhos$/, () => viewVizinhos()],
  [new RegExp(`^#/rov/novo(?:/${D})?$`), (m) => viewRovEditor(null, m[1])],
  [/^#\/rov\/([\w-]+)$/, (m) => viewRovEditor(m[1])],
  [/^#\/cadastro-vizinhos$/, () => viewCadastroVizinhos()],
  [/^#\/ajustes$/, () => viewAjustes()],
  [/^#\/ajustes\/lista\/(\w+)$/, (m) => viewLista(m[1])]
];

const main = document.getElementById('main');
const barraAcao = document.getElementById('barra-acao');
const tituloEl = document.getElementById('titulo');
const voltarEl = document.getElementById('voltar');
let viewAtual = null;
let renderizando = Promise.resolve();

export function ir(hash, forcar = false) {
  if (location.hash === hash) { if (forcar) rerender(); } else location.hash = hash;
}
export function rerender() { renderizando = renderizando.then(render, render); return renderizando; }

async function render() {
  await salvarPendentes();
  if (viewAtual?.saver) await viewAtual.saver.flush();
  const hash = location.hash || '#/hoje';
  let v = null;
  try {
    for (const [re, fn] of ROTAS) { const m = hash.match(re); if (m) { v = await fn(m); break; } }
    if (!v) { location.replace('#/hoje'); return; }
  } catch (e) {
    console.error(e);
    v = { titulo: 'Erro', el: h('div', { class: 'card' }, h('p', { class: 'erro' }, 'Erro: ' + e.message), h('a', { class: 'btn', href: '#/hoje' }, 'Voltar ao início')) };
  }
  viewAtual = v;
  tituloEl.textContent = v.titulo || 'RDO';
  voltarEl.hidden = !v.voltar;
  main.replaceChildren(v.el);
  barraAcao.replaceChildren(v.barra || '');
  document.body.classList.toggle('com-barra', !!v.barra);
  document.querySelectorAll('#abas a').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === (v.aba || '')));
  window.scrollTo(0, 0);
  atualizarBadge();
}

export async function atualizarBadge() {
  const b = document.getElementById('badge-rov');
  const n = await contarAbertos().catch(() => 0);
  b.textContent = n; b.hidden = !n;
}

// indicador "salvando / salvo"
const salvoEl = document.getElementById('salvo');
let tSalvo;
aoSalvar((estado) => {
  clearTimeout(tSalvo);
  salvoEl.textContent = estado === 'salvando' ? 'salvando…' : estado === 'salvo' ? 'salvo ✓' : 'erro ao salvar';
  salvoEl.className = estado;
  if (estado === 'salvo') tSalvo = setTimeout(() => { salvoEl.textContent = ''; }, 1500);
});

voltarEl.addEventListener('click', () => history.length > 1 ? history.back() : ir('#/hoje'));
window.addEventListener('hashchange', rerender);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarPendentes(); });
window.addEventListener('pagehide', () => salvarPendentes());

async function iniciar() {
  if (db.modoDemo()) { document.getElementById('faixa-demo').hidden = false; document.body.classList.add('demo'); }
  try {
    await db.abrir();
    await semearDemo();
    if (!(await db.getMeta('persistPedido')) && navigator.storage?.persist) {
      const ok = await navigator.storage.persist().catch(() => false);
      await db.setMeta('persistPedido', { em: new Date().toISOString(), concedido: ok });
    }
    limparFotosOrfas().catch(console.warn);
  } catch (e) {
    main.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'erro' }, 'Não foi possível abrir o armazenamento local: ' + e.message)));
    return;
  }
  if (!location.hash) location.replace('#/hoje');
  rerender();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch((e) => console.warn('SW', e));
}
iniciar();
