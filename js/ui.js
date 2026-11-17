// Componentes de interface reutilizáveis.
import * as db from './db.js';
import { comprimirImagem, uid, nowISO } from './util.js';
import { enviarArquivo, baixarArquivo, podeCompartilhar } from './destino.js';

// replaceChildren tolerante: ignora null/false e achata arrays (evita aparecer "null" na tela).
const _rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...k) { return _rc.apply(this, k.flat(Infinity).filter((x) => x != null && x !== false)); };

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props instanceof Node || typeof props === 'string' || Array.isArray(props)) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (['value', 'checked', 'disabled', 'readOnly', 'hidden', 'multiple'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function campo(rotulo, ...conteudo) {
  return h('div', { class: 'campo' }, rotulo ? h('label', { class: 'rotulo' }, rotulo) : null, ...conteudo);
}

/** Contador com −/+ e campo numérico digitável. */
export function stepper(valor, onChange, { readonly = false, pequeno = false } = {}) {
  let v = Number(valor) || 0;
  const inp = h('input', {
    class: 'st-val', type: 'number', inputmode: 'numeric', pattern: '[0-9]*', min: '0', value: String(v), disabled: readonly,
    onfocus: (e) => e.target.select(),
    oninput: (e) => { const n = parseInt(e.target.value, 10); v = Number.isFinite(n) && n >= 0 ? n : 0; onChange(v); }
  });
  const set = (n) => { v = Math.max(0, n); inp.value = String(v); onChange(v); };
  if (readonly) return h('span', { class: 'stepper ro' + (pequeno ? ' peq' : '') }, h('b', null, String(v)));
  return h('span', { class: 'stepper' + (pequeno ? ' peq' : '') },
    h('button', { type: 'button', class: 'st-btn', 'aria-label': 'diminuir', onclick: () => set(v - 1) }, '−'),
    inp,
    h('button', { type: 'button', class: 'st-btn', 'aria-label': 'aumentar', onclick: () => set(v + 1) }, '+'));
}

/** Seleção única em botões. Tocar no selecionado limpa (null). opcoes: string[] ou {id,nome}[] */
export function segmentado(opcoes, valor, onChange, { readonly = false, chips = false, limpar = true, antes } = {}) {
  const ops = opcoes.map((o) => (typeof o === 'string' ? { id: o, nome: o } : o));
  let atual = valor ?? null;
  const wrap = h('div', { class: chips ? 'chips' : 'seg' });
  const render = () => {
    wrap.replaceChildren(...ops.map((o) => h('button', {
      type: 'button', class: 'opc' + (o.id === atual ? ' sel' : ''), disabled: readonly && o.id !== atual,
      'aria-pressed': String(o.id === atual),
      onclick: async () => {
        if (readonly) return;
        const novo = o.id === atual ? (limpar ? null : atual) : o.id;
        if (novo === atual) return;
        if (antes && !(await antes(novo, atual))) return;
        atual = novo; render(); onChange(atual);
      }
    }, o.nome)));
    if (readonly && atual == null) wrap.replaceChildren(h('span', { class: 'vazio-txt' }, '—'));
  };
  render();
  wrap.definir = (v) => { atual = v; render(); };
  return wrap;
}

/** Seleção múltipla em botões (liga/desliga cada um). opcoes: {id,nome}[]. Devolve os ids na ordem das opções. */
export function multiSelecao(opcoes, valores, onChange, { chips = true } = {}) {
  const sel = new Set(valores || []);
  const wrap = h('div', { class: chips ? 'chips' : 'seg' });
  const render = () => wrap.replaceChildren(...opcoes.map((o) => h('button', {
    type: 'button', class: 'opc' + (sel.has(o.id) ? ' sel' : ''), 'aria-pressed': String(sel.has(o.id)),
    onclick: () => {
      if (sel.has(o.id)) sel.delete(o.id); else sel.add(o.id);
      render();
      onChange(opcoes.map((x) => x.id).filter((id) => sel.has(id)));
    }
  }, sel.has(o.id) ? '✓ ' + o.nome : o.nome)));
  render();
  return wrap;
}

/** textarea que cresce com o conteúdo (compatível com ditado do iOS). */
export function areaTexto(valor, onChange, { readonly = false, placeholder = '', linhas = 3 } = {}) {
  const t = h('textarea', { class: 'txt', rows: String(linhas), placeholder, readOnly: readonly, value: valor || '' });
  const ajusta = () => { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 44) + 'px'; };
  t.addEventListener('input', () => { ajusta(); onChange(t.value); });
  requestAnimationFrame(ajusta);
  setTimeout(ajusta, 50);
  return t;
}

export function texto(valor, onChange, { readonly = false, placeholder = '', tipo = 'text', inputmode } = {}) {
  return h('input', { class: 'inp', type: tipo, value: valor || '', placeholder, disabled: readonly, inputmode, oninput: (e) => onChange(e.target.value) });
}

// ---------- seções recolhíveis ----------
let estadoSecoes = {};
try { estadoSecoes = JSON.parse(localStorage.getItem('rdo-secoes') || '{}'); } catch { estadoSecoes = {}; }
export function secao(id, titulo, conteudo, { aberta = true } = {}) {
  const resumo = h('span', { class: 'sec-resumo' });
  const marca = h('span', { class: 'sec-marca' });
  const d = h('details', { class: 'secao', open: (estadoSecoes[id] ?? aberta) ? true : null },
    h('summary', null, marca, h('span', { class: 'sec-tit' }, titulo), resumo),
    h('div', { class: 'sec-corpo' }, conteudo));
  d.addEventListener('toggle', () => {
    estadoSecoes[id] = d.open;
    try { localStorage.setItem('rdo-secoes', JSON.stringify(estadoSecoes)); } catch { /* ok */ }
  });
  d.resumo = (t, ok) => { resumo.textContent = t || ''; marca.className = 'sec-marca' + (ok ? ' ok' : ''); };
  return d;
}

// ---------- modais ----------
export function modal({ titulo, corpo, botoes = [{ texto: 'OK', valor: true, classe: 'primario' }] }) {
  return new Promise((resolve) => {
    const fechar = (v) => { bg.remove(); document.body.classList.remove('com-modal'); resolve(v); };
    const caixa = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      titulo ? h('h3', null, titulo) : null,
      h('div', { class: 'modal-corpo' }, corpo),
      h('div', { class: 'modal-botoes' }, botoes.map((b) => h('button', {
        type: 'button', class: 'btn ' + (b.classe || ''),
        onclick: () => {
          if (b.acao) { b.acao(); if (!b.fecha) return; }
          if (b.validar && !b.validar()) return;
          fechar(typeof b.valor === 'function' ? b.valor() : b.valor);
        }
      }, b.texto))));
    const bg = h('div', { class: 'modal-bg' }, caixa);
    document.body.append(bg);
    document.body.classList.add('com-modal');
    const foco = caixa.querySelector('input:not([type=hidden]),textarea');
    if (foco) setTimeout(() => foco.focus(), 60);
  });
}

export function confirmar(titulo, msg = '', ok = 'Confirmar', perigo = false) {
  return modal({ titulo, corpo: msg ? h('p', null, msg) : null, botoes: [{ texto: 'Cancelar', valor: false }, { texto: ok, valor: true, classe: perigo ? 'perigo' : 'primario' }] });
}

/** Pergunta de texto. obrigatorio => não fecha vazio. Retorna string ou null. */
export function perguntar(titulo, { rotulo = '', valor = '', obrigatorio = false, multilinha = true, ok = 'OK', ajuda = '' } = {}) {
  const inp = multilinha ? h('textarea', { class: 'txt', rows: '3', value: valor }) : h('input', { class: 'inp', type: 'text', value: valor });
  const erro = h('p', { class: 'erro', hidden: true }, 'Campo obrigatório.');
  return modal({
    titulo,
    corpo: h('div', null, ajuda ? h('p', { class: 'nota' }, ajuda) : null, campo(rotulo, inp), erro),
    botoes: [{ texto: 'Cancelar', valor: null }, {
      texto: ok, classe: 'primario', valor: () => inp.value.trim(),
      validar: () => { if (obrigatorio && !inp.value.trim()) { erro.hidden = false; return false; } return true; }
    }]
  });
}

/** Mostra um arquivo pronto com botões de compartilhar e abrir/baixar (o toque garante o gesto exigido pelo iOS). */
export function oferecerArquivo(blob, nome, titulo = 'Arquivo pronto', msg = '') {
  const tipo = blob.type || 'application/pdf';
  const share = podeCompartilhar(tipo);
  return modal({
    titulo,
    corpo: h('div', null, msg ? h('p', null, msg) : null, h('p', { class: 'arquivo-nome' }, '📄 ', nome),
      !share ? h('p', { class: 'nota' }, 'Este navegador não permite compartilhar arquivos; use "Baixar".') : null),
    botoes: [
      tipo === 'application/pdf' ? { texto: '👁 Ver aqui', classe: 'primario', acao: () => { import('./visualizador.js').then((m) => m.verPdf(blob, nome)); } } : null,
      share ? { texto: 'Compartilhar…', classe: tipo === 'application/pdf' ? '' : 'primario', acao: () => { enviarArquivo(blob, nome, tipo); } } : null,
      { texto: share ? 'Abrir / baixar' : 'Baixar', classe: share ? '' : 'primario', acao: () => baixarArquivo(blob, nome) },
      { texto: 'Fechar', valor: true }
    ].filter(Boolean)
  });
}

export function toast(msg, ms = 2600) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('vis'), 10);
  setTimeout(() => { t.classList.remove('vis'); setTimeout(() => t.remove(), 300); }, ms);
}

export function carregando(msg = 'Aguarde…') {
  const el = h('div', { class: 'modal-bg carregando' }, h('div', { class: 'modal' }, h('div', { class: 'spinner' }), h('p', null, msg)));
  document.body.append(el);
  return () => el.remove();
}

// ---------- fotos ----------
const urls = new Map();
export async function urlFoto(id) {
  if (urls.has(id)) return urls.get(id);
  const f = await db.get('fotos', id);
  if (!f) return null;
  const u = URL.createObjectURL(f.blob);
  urls.set(id, u);
  return u;
}
export function miniatura(id) {
  const img = h('img', { class: 'mini', alt: 'foto', loading: 'lazy' });
  urlFoto(id).then((u) => { if (u) img.src = u; else img.alt = 'foto indisponível'; });
  return img;
}

export async function salvarFoto(file) {
  const { blob, w, h: alt } = await comprimirImagem(file);
  const foto = { id: uid(), blob, tipo: 'image/jpeg', w, h: alt, criadoEm: nowISO() };
  await db.put('fotos', foto);
  return foto.id;
}

function botoesFoto(onArquivos) {
  const handler = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const fim = carregando(files.length > 1 ? `Processando ${files.length} fotos…` : 'Processando foto…');
    try { await onArquivos(files); } catch (err) { alert(err.message); } finally { fim(); }
  };
  return h('div', { class: 'fotos-botoes' },
    // Sem o atributo capture: no iOS ele abre a câmera direto e, em alguns casos (Chrome, app instalado), a tela fica preta.
    // Assim o iOS mostra o menu nativo (Tirar Foto / Fototeca / Arquivos), que funciona em todos os navegadores.
    h('label', { class: 'btn' }, '📷 Câmera', h('input', { type: 'file', accept: 'image/*', class: 'oculto-input', onchange: handler })),
    h('label', { class: 'btn' }, '🖼️ Galeria / prints', h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'oculto-input', onchange: handler })));
}

/** Editor de lista de fotos [{fotoId, legenda}]. onChange() é chamado a cada mudança. */
export function galeria(lista, { readonly = false, legenda = true, onChange = () => {}, vazio = 'Sem fotos.' } = {}) {
  const wrap = h('div', { class: 'galeria-wrap' });
  const render = () => {
    const grade = h('div', { class: 'galeria' }, lista.map((f, i) => h('figure', { class: 'foto' },
      h('button', { type: 'button', class: 'foto-ver', onclick: () => verFoto(f.fotoId, f.legenda) }, miniatura(f.fotoId)),
      legenda ? (readonly
        ? (f.legenda ? h('figcaption', null, f.legenda) : null)
        : h('input', { class: 'inp legenda', placeholder: 'Legenda (opcional)', value: f.legenda || '', oninput: (e) => { f.legenda = e.target.value; onChange(); } }))
        : null,
      readonly ? null : h('button', {
        type: 'button', class: 'foto-rem', 'aria-label': 'remover foto',
        onclick: async () => { if (await confirmar('Remover esta foto?', '', 'Remover', true)) { lista.splice(i, 1); onChange(); render(); } }
      }, '✕'))));
    wrap.replaceChildren(
      lista.length ? grade : (readonly ? h('p', { class: 'nota' }, vazio) : null),
      readonly ? null : botoesFoto(async (files) => {
        for (const file of files) lista.push({ fotoId: await salvarFoto(file), legenda: '' });
        onChange(); render();
      }));
  };
  render();
  return wrap;
}

async function verFoto(id, leg) {
  const u = await urlFoto(id);
  if (!u) return;
  modal({ corpo: h('div', { class: 'foto-grande' }, h('img', { src: u, alt: leg || 'foto' }), leg ? h('p', null, leg) : null), botoes: [{ texto: 'Fechar', valor: true }] });
}
