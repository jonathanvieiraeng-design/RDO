// Tela "Hoje" (RDO do dia) e tela de detalhe de um RDO (PDF, compartilhar, revisão).
import { h, modal, confirmar, perguntar, oferecerArquivo, carregando, toast } from '../ui.js';
import { getConfig } from '../config.js';
import * as db from '../db.js';
import {
  rdoPorData, criarRDO, ultimoFechado, checklist, fecharRDO, pdfDoRDO, criarRevisao, versoesDe, todasUltimasVersoes
} from '../rdo.js';
import { rovsDoDia, mapaVizinhos, resumoROV } from '../rov.js';
import { gerarPdfRDO } from '../pdf.js';
import { hoje, fmtBR, diaSemana, somaDias, pad, fmtDataHora } from '../util.js';
import { editorRDO, blocoVizinhanca } from './rdoEditor.js';
import { ir, rerender } from '../app.js';
import { baixarArquivo, enviarArquivo } from '../destino.js';

function navData(data) {
  const ehHoje = data === hoje();
  return h('div', { class: 'nav-data' },
    h('button', { type: 'button', class: 'btn ic', 'aria-label': 'dia anterior', onclick: () => ir(`#/hoje/${somaDias(data, -1)}`) }, '‹'),
    h('input', { type: 'date', class: 'inp', value: data, onchange: (e) => e.target.value && ir(`#/hoje/${e.target.value}`) }),
    h('button', { type: 'button', class: 'btn ic', 'aria-label': 'próximo dia', onclick: () => ir(`#/hoje/${somaDias(data, 1)}`) }, '›'),
    ehHoje ? null : h('button', { type: 'button', class: 'btn', onclick: () => ir('#/hoje') }, 'Hoje'));
}

async function avisoAbertos(data) {
  const abertos = (await todasUltimasVersoes()).filter((r) => r.status === 'aberto' && r.data !== data);
  if (!abertos.length) return null;
  return h('div', { class: 'aviso' }, '⚠️ RDO em aberto: ',
    abertos.map((r, i) => [i ? ', ' : '', h('a', { href: `#/hoje/${r.data}` }, `nº ${pad(r.numero, 3)} (${fmtBR(r.data)})`)]));
}

/** Prévia em PDF (rascunho) com os ROVs atuais do dia. */
async function rovsAoVivo(data, cfg) {
  const viz = await mapaVizinhos();
  return (await rovsDoDia(data)).map((r) => resumoROV(r, cfg, viz));
}

export async function viewHoje(dataParam) {
  const data = dataParam || hoje();
  const cfg = await getConfig();
  const rdo = await rdoPorData(data);
  const rovsDia = await rovsDoDia(data);
  const aviso = await avisoAbertos(data);
  const titulo = data === hoje() ? 'RDO de hoje' : `RDO ${fmtBR(data)}`;

  if (!rdo) {
    const ult = await ultimoFechado(data);
    return {
      titulo, aba: 'hoje',
      el: h('div', null, navData(data), aviso,
        h('div', { class: 'card vazio' },
          h('p', null, `Nenhum RDO para ${fmtBR(data)} (${diaSemana(data)}).`),
          h('button', {
            type: 'button', class: 'btn primario grande',
            onclick: async () => { await criarRDO(data); rerender(); }
          }, `Iniciar RDO de ${fmtBR(data)}`),
          h('p', { class: 'nota' }, ult
            ? `Efetivo, subcontratadas e equipamentos serão copiados do RDO nº ${pad(ult.numero, 3)} (${fmtBR(ult.data)}); faltas começam zeradas.`
            : 'Não há RDO fechado anterior: as quantidades começam zeradas.')),
        h('div', { class: 'card' }, h('h3', null, 'Ocorrências de vizinhos nesta data'), blocoVizinhanca(rovsDia, data, cfg)))
    };
  }

  const fechado = rdo.status === 'fechado';
  const { el, saver } = editorRDO(rdo, cfg, { readonly: fechado, rovsDia });

  let barra;
  if (fechado) {
    barra = h('div', { class: 'barra' },
      h('a', { class: 'btn', href: `#/rdo/${rdo.id}` }, '📄 PDF / compartilhar'),
      h('button', { type: 'button', class: 'btn', onclick: () => fluxoRevisao(rdo) }, '✎ Criar revisão'));
  } else {
    barra = h('div', { class: 'barra' },
      h('button', {
        type: 'button', class: 'btn', onclick: async () => {
          await saver.flush();
          const fim = carregando('Gerando prévia…');
          try {
            const blob = await gerarPdfRDO(rdo, cfg, await rovsAoVivo(rdo.data, cfg));
            fim();
            await oferecerArquivo(blob, `PREVIA_RDO_${rdo.data}.pdf`, 'Prévia do PDF', 'Rascunho, sem validade. O RDO continua aberto.');
          } catch (e) { fim(); alert('Erro ao gerar PDF: ' + e.message); }
        }
      }, 'Prévia'),
      h('button', { type: 'button', class: 'btn primario', onclick: () => fluxoFechar(rdo, cfg, saver) }, '✓ Fechar RDO do dia'));
  }
  return { titulo, aba: 'hoje', el: h('div', null, navData(data), aviso, el), barra, saver };
}

async function fluxoFechar(rdo, cfg, saver) {
  await saver.flush();
  const pend = checklist(rdo);
  const corpo = h('div', null,
    pend.length
      ? [h('p', null, `Campos vazios (${pend.length}) — apenas aviso:`), h('ul', { class: 'check' }, pend.map((p) => h('li', null, p)))]
      : h('p', null, '✓ Todos os campos principais estão preenchidos.'),
    h('p', { class: 'nota' }, 'Ao fechar, o RDO fica travado (somente leitura). Alterações só por revisão, com motivo.'));
  const ok = await modal({
    titulo: `Fechar RDO nº ${pad(rdo.numero, 3)}${rdo.rev ? ' – Rev. ' + pad(rdo.rev) : ''}?`, corpo,
    botoes: [{ texto: 'Voltar e completar', valor: false }, { texto: 'Fechar RDO', valor: true, classe: 'primario' }]
  });
  if (!ok) return;
  const fim = carregando('Fechando e gerando PDF…');
  try {
    const { blob, nome } = await fecharRDO(rdo, cfg, gerarPdfRDO);
    fim();
    rerender();
    await oferecerArquivo(blob, nome, 'RDO fechado ✓', 'Toque em "Compartilhar…" e escolha OneDrive.');
  } catch (e) {
    fim();
    console.error(e);
    alert('Não foi possível fechar: ' + e.message + '\nO RDO continua aberto.');
  }
}

async function fluxoRevisao(rdo) {
  const versoes = await versoesDe(rdo.numero);
  if (versoes[0].id !== rdo.id) { toast('Já existe revisão mais recente deste RDO.'); return; }
  const motivo = await perguntar(`Criar Rev. ${pad(rdo.rev + 1)} do RDO nº ${pad(rdo.numero, 3)}`, {
    rotulo: 'Motivo da revisão (obrigatório)', obrigatorio: true, ok: 'Criar revisão',
    ajuda: 'A versão fechada atual fica preservada no histórico. A revisão abre uma cópia editável.'
  });
  if (!motivo) return;
  try {
    const nova = await criarRevisao(rdo, motivo);
    toast(`Revisão ${pad(nova.rev)} criada.`);
    ir(`#/hoje/${nova.data}`);
  } catch (e) { alert(e.message); }
}

/** Detalhe de uma versão específica: carrega o PDF antes (o toque em Compartilhar precisa ser imediato no iOS). */
export async function viewRdoDetalhe(id) {
  const rdo = await db.get('rdos', id);
  if (!rdo) return { titulo: 'RDO', voltar: true, el: h('p', { class: 'nota' }, 'RDO não encontrado.') };
  const cfg = await getConfig();
  const versoes = await versoesDe(rdo.numero);
  const ehUltima = versoes[0].id === rdo.id;
  let pdf = null, erro = null;
  if (rdo.status === 'fechado') {
    try { pdf = await pdfDoRDO(rdo, cfg, (r, c) => gerarPdfRDO(r, c)); } catch (e) { erro = e.message; }
  }
  const { el } = editorRDO(rdo, cfg, { readonly: true, rovsDia: await rovsDoDia(rdo.data) });
  const acoes = h('div', { class: 'card' },
    h('h3', null, `RDO nº ${pad(rdo.numero, 3)}${rdo.rev ? ' – Rev. ' + pad(rdo.rev) : ''} · ${fmtBR(rdo.data)}`),
    rdo.status !== 'fechado'
      ? [h('p', null, 'Esta versão está em aberto.'), h('a', { class: 'btn primario', href: `#/hoje/${rdo.data}` }, 'Continuar preenchendo')]
      : [
        pdf ? h('p', { class: 'arquivo-nome' }, '📄 ', pdf.nome) : h('p', { class: 'erro' }, 'Erro ao gerar PDF: ' + erro),
        h('div', { class: 'acoes' },
          pdf ? h('button', { type: 'button', class: 'btn primario', onclick: () => { enviarArquivo(pdf.blob, pdf.nome); } }, 'Compartilhar…') : null,
          pdf ? h('button', { type: 'button', class: 'btn', onclick: () => baixarArquivo(pdf.blob, pdf.nome) }, 'Abrir PDF') : null,
          ehUltima ? h('button', { type: 'button', class: 'btn', onclick: () => fluxoRevisao(rdo) }, '✎ Criar revisão') : null)
      ],
    versoes.length > 1 ? h('div', null, h('p', { class: 'rotulo' }, 'Versões'),
      h('div', { class: 'lista' }, versoes.map((v) => h('a', { class: 'item-lista' + (v.id === rdo.id ? ' atual' : ''), href: `#/rdo/${v.id}` },
        h('div', { class: 'il-topo' }, h('b', null, v.rev ? `Rev. ${pad(v.rev)}` : 'Original'), h('span', { class: 'badge ' + (v.status === 'fechado' ? 'cinza' : 'amarelo') }, v.status === 'fechado' ? 'Fechado' : 'Aberto')),
        h('div', { class: 'il-sub' }, v.status === 'fechado' ? `Fechado em ${fmtDataHora(v.fechadoEm)}` : 'Em edição', v.revMotivo ? ` · ${v.revMotivo}` : ''))))) : null);
  return { titulo: `RDO nº ${pad(rdo.numero, 3)}`, voltar: true, aba: 'historico', el: h('div', null, acoes, el) };
}
