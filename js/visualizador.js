// Visualizador de PDF dentro do app (sem baixar): desenha cada página com pdf.js (local, funciona offline).
import { h } from './ui.js';
import { enviarArquivo, baixarArquivo, podeCompartilhar } from './destino.js';

let pdfjs = null;
async function carregarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

/** Abre o PDF em tela cheia, com Compartilhar e Baixar. */
export async function verPdf(blob, nome, { aviso = '' } = {}) {
  const paginas = h('div', { class: 'visor-paginas' }, h('p', { class: 'nota centro' }, 'Carregando…'));
  const share = podeCompartilhar('application/pdf');
  const fechar = () => { visor.remove(); document.body.classList.remove('com-modal'); cancelado = true; doc?.destroy(); };
  let cancelado = false, doc = null;
  const visor = h('div', { class: 'visor', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'visor-topo' },
      h('button', { type: 'button', class: 'btn', onclick: fechar }, '✕ Fechar'),
      h('button', { type: 'button', class: 'btn ic', 'aria-label': 'ampliar', onclick: (e) => { const z = visor.classList.toggle('zoom'); e.currentTarget.textContent = z ? '➖' : '🔍'; } }, '🔍'),
      h('span', { class: 'visor-nome' }, nome),
      share
        ? h('button', { type: 'button', class: 'btn primario', onclick: () => { enviarArquivo(blob, nome); } }, 'Compartilhar…')
        : h('button', { type: 'button', class: 'btn primario', onclick: () => baixarArquivo(blob, nome) }, 'Baixar')),
    aviso ? h('div', { class: 'visor-aviso' }, aviso) : null,
    paginas);
  document.body.append(visor);
  document.body.classList.add('com-modal');

  try {
    const lib = await carregarPdfjs();
    doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    if (cancelado) return;
    paginas.replaceChildren();
    const largura = Math.min(paginas.clientWidth || window.innerWidth, 900) - 16;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * 1.5; // folga para o modo ampliado sem estourar a memória do iPhone
    for (let n = 1; n <= doc.numPages && !cancelado; n++) {
      const pg = await doc.getPage(n);
      const vp1 = pg.getViewport({ scale: 1 });
      const escala = (largura / vp1.width) * dpr;
      const vp = pg.getViewport({ scale: escala });
      const cv = h('canvas', { class: 'visor-pagina' });
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      cv.style.setProperty("--w", `${largura}px`); cv.style.setProperty("--h", `${Math.floor(vp.height / dpr)}px`);
      paginas.append(cv, h('p', { class: 'visor-num' }, `Página ${n} de ${doc.numPages}`));
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    console.error(e);
    if (!cancelado) paginas.replaceChildren(h('p', { class: 'erro' }, 'Não foi possível mostrar o PDF aqui: ' + e.message),
      h('button', { type: 'button', class: 'btn', onclick: () => baixarArquivo(blob, nome) }, 'Abrir / baixar'));
  }
}
