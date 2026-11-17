// Geração de PDF (A4 retrato, margens 15 mm, Carlito embutida, tons de cinza, logo da Arco-Íris-Mar no cabeçalho).
import * as db from './db.js';
import {
  fmtBR, fmtDataHora, diaSemana, diasDecorridos, diasRestantes, fmtDias, pad, bufferParaBase64, blobParaDataURL, nowISO
} from './util.js';
import { nomeItem } from './config.js';
import { totaisEfetivo } from './rdo.js';

const M = 15, PW = 210, PH = 297, CW = PW - 2 * M;
const TOPO = M + 13;           // início do conteúdo (abaixo do cabeçalho)
const FUNDO = PH - M - 11;     // limite do conteúdo (acima do rodapé)
const PT = 0.3528;             // mm por ponto
const PAD = 1.6;
const C = { texto: 25, medio: 85, claro: 140, linha: 175, fundo: 232, fundo2: 246 };

let fontes;
async function carregarFontes() {
  if (fontes !== undefined) return fontes;
  try {
    const [r, b] = await Promise.all(['fonts/Carlito-Regular.ttf', 'fonts/Carlito-Bold.ttf'].map(async (u) => {
      const res = await fetch(u);
      if (!res.ok) throw new Error(u);
      return bufferParaBase64(await res.arrayBuffer());
    }));
    fontes = { r, b };
  } catch (e) {
    console.warn('Carlito indisponível, usando Helvetica', e);
    fontes = null;
  }
  return fontes;
}

// Logo da construtora: PNG transparente convertido em JPEG sobre branco (o jsPDF guardaria o PNG sem compressão).
const LOGO_W = 36, LOGO_H = LOGO_W * 190 / 1250;
const OURO = [195, 165, 89];
let logo;
async function carregarLogo() {
  if (logo !== undefined) return logo;
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('logo não encontrada'));
      i.src = 'assets/logo-arcoirismar.png';
    });
    const c = document.createElement('canvas');
    c.width = 750; c.height = Math.round(750 * img.naturalHeight / img.naturalWidth);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    logo = c.toDataURL('image/jpeg', 0.92);
  } catch (e) {
    console.warn('Logo indisponível no PDF', e);
    logo = null;
  }
  return logo;
}

class Doc {
  constructor(f, lg = null) {
    this.logo = lg;
    const { jsPDF } = window.jspdf;
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    this.fam = 'helvetica';
    if (f) {
      this.doc.addFileToVFS('Carlito-Regular.ttf', f.r);
      this.doc.addFont('Carlito-Regular.ttf', 'Carlito', 'normal');
      this.doc.addFileToVFS('Carlito-Bold.ttf', f.b);
      this.doc.addFont('Carlito-Bold.ttf', 'Carlito', 'bold');
      this.fam = 'Carlito';
    }
    this.y = TOPO;
    this.imgs = new Set();
  }
  f(estilo = 'normal', tam = 10, cor = C.texto) { this.doc.setFont(this.fam, estilo); this.doc.setFontSize(tam); this.doc.setTextColor(cor); }
  lh(tam) { return tam * PT * 1.2; }
  nova() { this.doc.addPage(); this.y = TOPO; }
  garante(alt) { if (this.y + alt > FUNDO) { this.nova(); return true; } return false; }
  quebra(t, w) { return this.doc.splitTextToSize(String(t ?? ''), w); }

  tituloSecao(t) {
    this.garante(16);
    this.y += 2.5;
    this.doc.setFillColor(C.fundo);
    this.doc.rect(M, this.y, CW, 6.6, 'F');
    this.f('bold', 10.5);
    this.doc.text(t.toUpperCase(), M + 2, this.y + 4.6);
    this.y += 8.6;
  }
  subtitulo(t) {
    this.garante(10);
    this.f('bold', 10);
    this.doc.text(t, M, this.y + 3.6);
    this.y += 5.4;
  }
  paragrafo(t, { tam = 10, estilo = 'normal', recuo = 0, cor = C.texto, apos = 1.8 } = {}) {
    this.f(estilo, tam, cor);
    const lh = this.lh(tam);
    const linhas = this.quebra(t == null || t === '' ? '—' : t, CW - recuo);
    for (const ln of linhas) { this.garante(lh); this.doc.text(ln, M + recuo, this.y + lh * 0.8); this.y += lh; }
    this.y += apos;
  }
  rotuloValor(rot, val) {
    this.garante(10);
    this.f('bold', 9, C.medio);
    this.doc.text(rot, M, this.y + 3.2);
    this.y += 4.4;
    this.paragrafo(val, { apos: 2.6 });
  }

  _linhas(celulas, negrito, span, ws, w, tam) {
    this.f(negrito ? 'bold' : 'normal', tam);
    if (span) return [this.quebra(celulas[0], w - 2 * PAD)];
    return celulas.map((c, i) => this.quebra(c == null || c === '' ? '—' : String(c), ws[i] - 2 * PAD));
  }
  _desenha(linhas, x, ws, w, y, alt, est, tam, alins) {
    const d = this.doc;
    if (est.fundo != null) { d.setFillColor(est.fundo); d.rect(x, y, w, alt, 'F'); }
    d.setDrawColor(C.linha); d.setLineWidth(0.2);
    this.f(est.negrito ? 'bold' : 'normal', tam);
    const lh = this.lh(tam);
    if (est.span) {
      d.rect(x, y, w, alt);
      linhas[0].forEach((ln, k) => d.text(ln, x + PAD, y + PAD + lh * k + lh * 0.8));
      return;
    }
    let cx = x;
    linhas.forEach((ls, i) => {
      d.rect(cx, y, ws[i], alt);
      const al = alins[i] || 'left';
      ls.forEach((ln, k) => {
        const ty = y + PAD + lh * k + lh * 0.8;
        if (al === 'center') d.text(ln, cx + ws[i] / 2, ty, { align: 'center' });
        else if (al === 'right') d.text(ln, cx + ws[i] - PAD, ty, { align: 'right' });
        else d.text(ln, cx + PAD, ty);
      });
      cx += ws[i];
    });
  }
  /** cols: [{t, w (fração), al}], linhas: arrays ou {c:[...], negrito, fundo, span} */
  tabela(cols, linhas, { x = M, w = CW, tam = 9, cabecalho = true, medir = false } = {}) {
    const ws = cols.map((c) => c.w * w);
    const alins = cols.map((c) => c.al);
    const lh = this.lh(tam);
    const altDe = (ls) => Math.max(1, ...ls.map((l) => l.length)) * lh + 2 * PAD;
    const cab = cabecalho ? this._linhas(cols.map((c) => c.t), true, false, ws, w, tam) : null;
    const altCab = cab ? altDe(cab) : 0;
    const norm = linhas.map((l) => (Array.isArray(l) ? { c: l } : l));
    const conteudos = norm.map((l) => ({ est: l, ls: this._linhas(l.c, l.negrito, l.span, ws, w, tam) }));
    if (medir) return altCab + conteudos.reduce((s, r) => s + altDe(r.ls), 0) + 3;

    const desenhaCab = () => { if (!cab) return; this._desenha(cab, x, ws, w, this.y, altCab, { negrito: true, fundo: C.fundo }, tam, alins); this.y += altCab; };
    this.garante(altCab + (conteudos[0] ? Math.min(altDe(conteudos[0].ls), 30) : 0));
    desenhaCab();
    for (const { est, ls } of conteudos) {
      const altTotal = altDe(ls);
      if (this.y + altTotal > FUNDO && altTotal <= FUNDO - TOPO - altCab) { this.nova(); desenhaCab(); }
      const max = Math.max(1, ...ls.map((l) => l.length));
      let off = 0;
      while (off < max) {
        const cabe = Math.floor((FUNDO - this.y - 2 * PAD) / lh);
        if (cabe < 1) { this.nova(); desenhaCab(); continue; }
        const n = Math.min(cabe, max - off);
        const parte = ls.map((l) => l.slice(off, off + n));
        const alt = n * lh + 2 * PAD;
        this._desenha(parte, x, ws, w, this.y, alt, est, tam, alins);
        this.y += alt;
        off += n;
        if (off < max) { this.nova(); desenhaCab(); }
      }
    }
    this.y += 3;
    return 0;
  }

  /** Duas tabelas lado a lado (se couberem juntas); senão, uma após a outra. */
  ladoALado(a, b) {
    const g = 4, w = (CW - g) / 2;
    const ha = a.cols ? this.tabela(a.cols, a.linhas, { w, medir: true }) : 0;
    const hb = b.cols ? this.tabela(b.cols, b.linhas, { w, medir: true }) : 0;
    const max = Math.max(ha, hb);
    if (max <= FUNDO - TOPO) {
      if (a.titulo || b.titulo) this.garante(max + 6);
      else this.garante(max);
      const y0 = this.y;
      let ya = y0, yb = y0;
      if (a.cols) { this.f('bold', 9.5); this.doc.text(a.titulo, M, y0 + 3.4); this.y = y0 + 5; this.tabela(a.cols, a.linhas, { w }); ya = this.y; }
      if (b.cols) { const xb = a.cols ? M + w + g : M; this.f('bold', 9.5); this.doc.text(b.titulo, xb, y0 + 3.4); this.y = y0 + 5; this.tabela(b.cols, b.linhas, { x: xb, w }); yb = this.y; }
      this.y = Math.max(ya, yb);
    } else {
      for (const t of [a, b]) if (t.cols) { this.subtitulo(t.titulo); this.tabela(t.cols, t.linhas); }
    }
  }

  async fotos(lista) {
    const g = 6, w = (CW - g) / 2, maxH = 70;
    for (let i = 0; i < lista.length; i += 2) {
      const par = lista.slice(i, i + 2);
      const itens = [];
      for (const f of par) {
        const reg = await db.get('fotos', f.fotoId);
        let dims = { w, h: 40 }, data = null;
        if (reg) {
          data = await blobParaDataURL(reg.blob);
          const r = Math.min(w / reg.w, maxH / reg.h);
          dims = { w: reg.w * r, h: reg.h * r };
        }
        this.f('normal', 8.5);
        const leg = this.quebra(`Foto ${pad(f.numero)}${f.legenda ? ' – ' + f.legenda : ''}`, w);
        itens.push({ f, reg, data, dims, leg });
      }
      const lh = this.lh(8.5);
      const altLinha = Math.max(...itens.map((it) => it.dims.h + 1.5 + it.leg.length * lh)) + 4;
      this.garante(altLinha);
      itens.forEach((it, k) => {
        const x0 = M + k * (w + g);
        const xi = x0 + (w - it.dims.w) / 2;
        if (it.data) {
          const alias = 'img_' + it.f.fotoId;
          this.doc.addImage(it.data, 'JPEG', xi, this.y, it.dims.w, it.dims.h, alias, 'FAST');
          this.doc.setDrawColor(C.linha); this.doc.setLineWidth(0.2);
          this.doc.rect(xi, this.y, it.dims.w, it.dims.h);
        } else {
          this.doc.setDrawColor(C.linha); this.doc.rect(x0, this.y, w, it.dims.h);
          this.f('normal', 9, C.claro); this.doc.text('foto indisponível', x0 + w / 2, this.y + it.dims.h / 2, { align: 'center' });
        }
        this.f('normal', 8.5, C.medio);
        it.leg.forEach((ln, j) => this.doc.text(ln, x0 + w / 2, this.y + it.dims.h + 1.5 + lh * (j + 0.8), { align: 'center' }));
      });
      this.y += altLinha;
    }
  }

  finalizar(cab, rod) {
    const n = this.doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i);
      let xt = M;
      if (this.logo) {
        this.doc.addImage(this.logo, 'JPEG', M, M + 4.7 - LOGO_H / 2, LOGO_W, LOGO_H, 'logo', 'FAST');
        xt = M + LOGO_W + 4;
        this.doc.setDrawColor(C.linha); this.doc.setLineWidth(0.2);
        this.doc.line(xt - 2, M + 0.3, xt - 2, M + 8.3);
      }
      this.f('bold', 9);
      this.doc.text(cab.esq, xt, M + 3);
      this.f('normal', 8.5, C.medio);
      if (cab.dir) this.doc.text(cab.dir, PW - M, M + 3, { align: 'right' });
      if (cab.dir2) this.doc.text(cab.dir2, PW - M, M + 7.2, { align: 'right' });
      if (cab.esq2) {
        const livre = PW - M - xt - (cab.dir2 ? this.doc.getTextWidth(cab.dir2) + 4 : 0);
        this.doc.text(this.quebra(cab.esq2, livre)[0] || '', xt, M + 7.2);
      }
      this.doc.setDrawColor(...OURO); this.doc.setLineWidth(0.6);
      this.doc.line(M, M + 9.5, PW - M, M + 9.5);

      const yr = PH - M - 7;
      this.doc.setDrawColor(C.claro); this.doc.setLineWidth(0.3);
      this.doc.line(M, yr, PW - M, yr);
      this.f('normal', 8, C.medio);
      this.doc.text(rod.l1, M, yr + 3.8);
      if (rod.l2) this.doc.text(rod.l2, M, yr + 7.4);
      this.f('bold', 8, C.medio);
      this.doc.text(`Página ${i} de ${n}`, PW - M, yr + 3.8, { align: 'right' });
    }
    return this.doc.output('blob');
  }
}

function assinatura(cfg) {
  const partes = [cfg.responsavel, cfg.registro].filter((s) => s && s.trim());
  return partes.length ? partes.join(' – ') : '—';
}
const demo = () => db.modoDemo();

// =====================================================================
// PDF do RDO
// =====================================================================
export async function gerarPdfRDO(rdo, cfg, rovsAoVivo = null) {
  const d = new Doc(await carregarFontes(), await carregarLogo());
  const num = pad(rdo.numero, 3);
  const rev = rdo.rev ? `Rev. ${pad(rdo.rev)}` : '';
  const dec = diasDecorridos(cfg, rdo.data), rest = diasRestantes(cfg, rdo.data);

  // 1. Cabeçalho
  d.f('bold', 15);
  d.doc.text('RELATÓRIO DIÁRIO DE OBRA – RDO', M, d.y + 5);
  d.y += 9;
  if (rdo.status !== 'fechado' || demo()) {
    d.paragrafo(rdo.status !== 'fechado' ? 'RASCUNHO – RDO ainda não fechado (prévia sem validade).' : 'DOCUMENTO DE DEMONSTRAÇÃO – dados fictícios.', { tam: 9.5, estilo: 'bold', cor: C.medio });
  }
  const kv = (a, b, c, e) => [{ c: [a, b, c, e] }];
  d.tabela(
    [{ t: '', w: 0.17 }, { t: '', w: 0.38 }, { t: '', w: 0.17 }, { t: '', w: 0.28 }],
    [
      ...kv('Obra', cfg.nome, 'Nº do RDO', num + (rev ? ` – ${rev}` : '')),
      ...kv('Endereço', cfg.endereco, 'Data', fmtBR(rdo.data)),
      ...kv('Contratante', cfg.contratante, 'Dia da semana', diaSemana(rdo.data)),
      ...kv('Unidade construtiva', cfg.unidade, 'Dias decorridos', fmtDias(dec)),
      ...kv('Tipo de obra', cfg.tipo, 'Dias restantes', fmtDias(rest))
    ].map((l) => ({ ...l, c: l.c })),
    { cabecalho: false, tam: 9.5 }
  );
  if (rdo.rev) d.paragrafo(`Revisão ${pad(rdo.rev)} – Motivo: ${rdo.revMotivo || '—'}`, { tam: 9.5, estilo: 'bold' });

  // 2. Tempo
  d.tituloSecao('Condições do tempo');
  const tempoLinhas = [[rdo.tempo.manha || '—', rdo.tempo.tarde || '—']];
  d.tabela([{ t: 'Manhã', w: 0.5, al: 'center' }, { t: 'Tarde', w: 0.5, al: 'center' }], tempoLinhas);
  if (rdo.tempo.paralisacao) {
    d.paragrafo(`Paralisação por chuva: ${rdo.tempo.paralisacao}${rdo.tempo.paralisacao === 'Sim' && rdo.tempo.paralisacaoObs ? ' – ' + rdo.tempo.paralisacaoObs : ''}`, { tam: 9.5 });
  }

  // 3. Efetivo
  d.tituloSecao('Efetivo');
  const ef = cfg.listas.funcoes
    .map((f) => ({ f, e: rdo.efetivo[f.id] }))
    .filter(({ e }) => e && (e.presente > 0 || e.faltas > 0));
  for (const id of Object.keys(rdo.efetivo)) {
    if (!cfg.listas.funcoes.some((f) => f.id === id)) { const e = rdo.efetivo[id]; if (e.presente > 0 || e.faltas > 0) ef.push({ f: { nome: '(função removida)' }, e }); }
  }
  if (ef.length) {
    const t = totaisEfetivo(rdo);
    d.tabela(
      [{ t: 'Função', w: 0.36 }, { t: 'Presentes', w: 0.14, al: 'center' }, { t: 'Faltas', w: 0.12, al: 'center' }, { t: 'Observação', w: 0.38 }],
      [...ef.map(({ f, e }) => [f.nome, String(e.presente || 0), String(e.faltas || 0), e.obs || '']),
        { c: ['TOTAL', String(t.presentes), String(t.faltas), ''], negrito: true, fundo: C.fundo2 }]
    );
  } else d.paragrafo('Nenhum efetivo registrado.', { tam: 9.5 });

  // 4. Subcontratadas e equipamentos
  const subs = cfg.listas.subcontratadas.filter((s) => rdo.subcontratadas[s.id]?.qtd > 0);
  const eqs = cfg.listas.equipamentos.filter((s) => rdo.equipamentos[s.id]?.qtd > 0);
  if (subs.length || eqs.length) {
    d.tituloSecao('Subcontratadas e equipamentos');
    d.ladoALado(
      subs.length ? { titulo: 'Subcontratadas', cols: [{ t: 'Empresa / serviço', w: 0.5 }, { t: 'Qtd.', w: 0.14, al: 'center' }, { t: 'Obs.', w: 0.36 }], linhas: subs.map((s) => [s.nome, String(rdo.subcontratadas[s.id].qtd), rdo.subcontratadas[s.id].obs || '']) } : {},
      eqs.length ? { titulo: 'Equipamentos', cols: [{ t: 'Equipamento', w: 0.78 }, { t: 'Qtd.', w: 0.22, al: 'center' }], linhas: eqs.map((s) => [s.nome, String(rdo.equipamentos[s.id].qtd)]) } : {}
    );
  }

  // Numeração de fotos: serviços primeiro, depois fotos gerais
  const fotosPdf = [];
  const refFotos = new Map();
  rdo.servicos.forEach((s) => {
    const nums = [];
    s.fotos.forEach((f) => {
      const numero = fotosPdf.length + 1;
      nums.push(numero);
      const area = nomeItem(cfg, 'pavimentos', s.areaId);
      fotosPdf.push({ ...f, numero, legenda: f.legenda || [area, (s.descricao || '').split('\n')[0].slice(0, 70)].filter(Boolean).join(' – ') });
    });
    refFotos.set(s, nums);
  });
  rdo.fotos.forEach((f) => fotosPdf.push({ ...f, numero: fotosPdf.length + 1 }));

  // 5. Serviços
  d.tituloSecao('Serviços executados');
  const servs = rdo.servicos.filter((s) => s.descricao.trim() || s.fotos.length);
  if (servs.length) {
    const ordem = cfg.listas.pavimentos.map((p) => p.id);
    const grupos = new Map();
    for (const s of servs) { const k = s.areaId || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(s); }
    const chaves = [...grupos.keys()].sort((a, b) => {
      const ia = a ? ordem.indexOf(a) : 9999, ib = b ? ordem.indexOf(b) : 9999;
      return (ia < 0 ? 9998 : ia) - (ib < 0 ? 9998 : ib);
    });
    const linhas = [];
    for (const k of chaves) {
      linhas.push({ c: [k ? nomeItem(cfg, 'pavimentos', k) : 'Área não informada'], span: true, negrito: true, fundo: C.fundo2 });
      for (const s of grupos.get(k)) {
        const nums = refFotos.get(s) || [];
        const ref = nums.length ? `\n(ver ${nums.map((n) => 'Foto ' + pad(n)).join(', ')})` : '';
        linhas.push([(s.descricao.trim() || '—') + ref, s.situacao || '—']);
      }
    }
    d.tabela([{ t: 'Descrição do serviço', w: 0.78 }, { t: 'Situação', w: 0.22, al: 'center' }], linhas);
  } else d.paragrafo('Nenhum serviço registrado.', { tam: 9.5 });

  // 6. Observações
  d.tituloSecao('Observações');
  d.rotuloValor('Observações da fiscalização', rdo.fiscalizacao.trim());
  d.rotuloValor('Ocorrências gerais do dia', rdo.ocorrencias.trim());
  d.rotuloValor('Conclusão / total de produção do dia', rdo.producao.trim());

  // 7. Vizinhança
  d.tituloSecao('Ocorrências de vizinhança do dia');
  const rovs = rdo.rovSnapshot || rovsAoVivo || [];
  if (!rovs.length) d.paragrafo('Sem ocorrências de vizinhança registradas.', { tam: 9.5 });
  for (const r of rovs) {
    d.tabela([{ t: '', w: 0.2 }, { t: '', w: 0.8 }], [
      { c: [`${r.codigo || 'ROV'}${r.hora ? ' · ' + r.hora : ''}`, [r.vizinho || '—', r.endereco].filter(Boolean).join(' – ')], negrito: true, fundo: C.fundo2 },
      ['Tipo / assunto', [r.tipo, r.assunto].filter(Boolean).join(' / ') || '—'],
      ['Status', r.cancelado ? `Cancelado – ${r.cancelado}` : r.status],
      ['Descrição', r.descricao],
      ['Esclarecimento / ação', r.acao]
    ], { cabecalho: false, tam: 9 });
  }

  // 8. Fotos
  if (fotosPdf.length) {
    d.tituloSecao('Registro fotográfico');
    await d.fotos(fotosPdf);
  }

  // 9. Fechamento (rodapé)
  const fech = rdo.fechadoEm ? `Fechado em ${fmtDataHora(rdo.fechadoEm)}` : `Rascunho gerado em ${fmtDataHora(nowISO())}`;
  return d.finalizar(
    {
      esq: 'RELATÓRIO DIÁRIO DE OBRA – RDO' + (demo() ? ' [DEMONSTRAÇÃO]' : ''),
      dir: `Nº ${num}${rev ? ' – ' + rev : ''}`,
      esq2: cfg.nome || '—',
      dir2: `${fmtBR(rdo.data)} – ${diaSemana(rdo.data)}`
    },
    { l1: `Preenchido por ${assinatura(cfg)}`, l2: fech }
  );
}

// =====================================================================
// PDF do ROV (período filtrado)
// =====================================================================
export async function gerarPdfROV(rovs, { ini, fim }, cfg, vizinhos) {
  const d = new Doc(await carregarFontes(), await carregarLogo());
  const emissao = nowISO();
  const periodo = `${fmtBR(ini)} a ${fmtBR(fim)}`;

  d.f('bold', 14);
  d.doc.text('RELATÓRIO DE OCORRÊNCIAS DE VIZINHANÇA – ROV', M, d.y + 5);
  d.y += 9;
  if (demo()) d.paragrafo('DOCUMENTO DE DEMONSTRAÇÃO – dados fictícios.', { tam: 9.5, estilo: 'bold', cor: C.medio });
  d.tabela([{ t: '', w: 0.25 }, { t: '', w: 0.75 }], [
    ['Obra', cfg.nome], ['Unidade construtiva', cfg.unidade], ['Tipo de obra', cfg.tipo], ['Endereço da obra', cfg.endereco],
    ['Período', periodo], ['Data de emissão', fmtDataHora(emissao)], ['Responsável', assinatura(cfg)],
    ['Total de ocorrências', String(rovs.length)]
  ], { cabecalho: false, tam: 9.5 });

  const nomeViz = (r) => vizinhos.get(r.vizinhoId)?.nome || '—';
  const assunto = (r) => nomeItem(cfg, 'assuntos', r.assuntoId) || '—';
  const st = (r) => (r.cancelado ? 'Cancelado' : r.status);

  d.tituloSecao('Resumo');
  if (rovs.length) {
    d.tabela(
      [{ t: 'ID', w: 0.13 }, { t: 'Data', w: 0.13, al: 'center' }, { t: 'Vizinho', w: 0.32 }, { t: 'Assunto', w: 0.2 }, { t: 'Status', w: 0.22 }],
      rovs.map((r) => [r.codigo, fmtBR(r.data), nomeViz(r), assunto(r), st(r)])
    );
  } else d.paragrafo('Nenhuma ocorrência no período / filtro selecionado.');

  for (const r of rovs) {
    const v = vizinhos.get(r.vizinhoId);
    d.garante(60);
    d.tituloSecao(`Ficha ${r.codigo}`);
    d.tabela([{ t: '', w: 0.28 }, { t: '', w: 0.72 }], [
      ['Data / hora', `${fmtBR(r.data)} ${r.hora || ''}`.trim()],
      ['Vizinho', v?.nome || '—'],
      ['Nº casa / apto / prédio', v?.endereco || '—'],
      ['Telefone', v?.telefone || '—'],
      ['Canal do contato', r.canal || '—'],
      ['Tipo de ocorrência', r.tipo || '—'],
      ['Assunto', assunto(r)],
      ['Status', st(r)],
      ['Data de resolução', r.dataResolucao ? fmtBR(r.dataResolucao) : '—'],
      ...(r.cancelado ? [['Cancelamento', `${fmtDataHora(r.cancelado.em)} – ${r.cancelado.motivo}`]] : [])
    ], { cabecalho: false, tam: 9.5 });
    d.rotuloValor('Descrição da ocorrência', r.descricao.trim());
    d.rotuloValor('Esclarecimento / ação tomada', r.acao.trim());
    if (r.historico.length) {
      d.subtitulo('Histórico de status');
      d.tabela(
        [{ t: 'Data / hora', w: 0.2 }, { t: 'De', w: 0.17 }, { t: 'Para', w: 0.17 }, { t: 'Nota', w: 0.46 }],
        r.historico.map((x) => [fmtDataHora(x.em), x.de || '—', x.para, x.nota || ''])
      );
    }
    if (r.fotos.length) {
      d.subtitulo('Evidências');
      await d.fotos(r.fotos.map((f, i) => ({ ...f, numero: i + 1 })));
    }
  }

  return d.finalizar(
    { esq: 'RELATÓRIO DE OCORRÊNCIAS DE VIZINHANÇA – ROV' + (demo() ? ' [DEMONSTRAÇÃO]' : ''), dir: `Período: ${periodo}`, esq2: cfg.nome || '—', dir2: '' },
    { l1: `Responsável: ${assinatura(cfg)}`, l2: `Emitido em ${fmtDataHora(emissao)}` }
  );
}
