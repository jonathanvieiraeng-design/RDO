// Tela "Hoje" (RDO do dia, com calendário) e tela de PDF de um RDO.
import { h, modal, confirmar, oferecerArquivo, carregando, toast } from '../ui.js';
import { getConfig } from '../config.js';
import * as db from '../db.js';
import { rdoPorData, criarRDO, ultimoAnterior, checklist, gerarVersao, pdfDoRDO, apagarRDO, todosRDOs, situacaoRDO } from '../rdo.js';
import { rovsDoDia, mapaVizinhos, resumoROV } from '../rov.js';
import { gerarPdfRDO } from '../pdf.js';
import { hoje, fmtBR, diaSemana, somaDias, pad, fmtDataHora } from '../util.js';
import { editorRDO, blocoVizinhanca } from './rdoEditor.js';
import { ir, rerender } from '../app.js';
import { baixarArquivo, enviarArquivo } from '../destino.js';
import { verPdf } from '../visualizador.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const fmtLongo = (s) => { const [y, m, d] = s.split('-'); return `${+d} de ${MESES_CURTOS[+m - 1]} de ${y}`; };

// ---------- calendário ----------
/** Abre o calendário do mês. Cores: verde = PDF gerado em dia; amarelo = iniciado, sem PDF ou alterado depois;
 *  vermelho claro = dia útil (seg–sex) já passado, a partir do início da obra, sem RDO. */
async function abrirCalendario(dataAtual) {
  const cfg = await getConfig();
  const porData = new Map((await todosRDOs()).map((r) => [r.data, situacaoRDO(r)]));
  const hj = hoje();
  const inicioFaltas = cfg.inicio || [...porData.keys()].sort()[0] || hj;
  let [ano, mes] = dataAtual.split('-').map(Number);

  const grade = h('div', { class: 'cal-grade' });
  const tituloMes = h('b', { class: 'cal-mes' });
  let fechar;
  const render = () => {
    tituloMes.textContent = `${MESES[mes - 1][0].toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}`;
    const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
    const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const cel = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => h('span', { class: 'cal-sem' }, d));
    for (let i = 0; i < primeiro; i++) cel.push(h('span'));
    for (let d = 1; d <= dias; d++) {
      const s = `${ano}-${pad(mes)}-${pad(d)}`;
      const sit = porData.get(s);
      const dow = (primeiro + d - 1) % 7;
      const falta = !sit && s < hj && s >= inicioFaltas && dow >= 1 && dow <= 5;
      const cls = ['cal-dia', sit === 'gerado' ? 'c-ok' : sit === 'pendente' ? 'c-pend' : falta ? 'c-falta' : '',
        s === hj ? 'c-hoje' : '', s === dataAtual ? 'c-atual' : ''].filter(Boolean).join(' ');
      cel.push(h('button', { type: 'button', class: cls, onclick: () => { fechar(); ir(`#/hoje/${s}`); } }, String(d)));
    }
    grade.replaceChildren(...cel);
  };
  const mudaMes = (n) => { mes += n; if (mes < 1) { mes = 12; ano--; } if (mes > 12) { mes = 1; ano++; } render(); };
  render();
  const corpo = h('div', null,
    h('div', { class: 'cal-topo' },
      h('button', { type: 'button', class: 'btn ic', 'aria-label': 'mês anterior', onclick: () => mudaMes(-1) }, '‹'),
      tituloMes,
      h('button', { type: 'button', class: 'btn ic', 'aria-label': 'próximo mês', onclick: () => mudaMes(1) }, '›')),
    grade,
    h('div', { class: 'cal-legenda' },
      h('span', null, h('i', { class: 'c-ok' }), 'PDF gerado'),
      h('span', null, h('i', { class: 'c-pend' }), 'Sem PDF / alterado'),
      h('span', null, h('i', { class: 'c-falta' }), 'Dia útil sem RDO')));
  const p = modal({ titulo: null, corpo, botoes: [{ texto: 'Ir para hoje', valor: 'hoje' }, { texto: 'Fechar', valor: null }] });
  fechar = () => { document.querySelector('.modal-bg')?.remove(); document.body.classList.remove('com-modal'); };
  if ((await p) === 'hoje') ir('#/hoje');
}

function navData(data) {
  return h('div', { class: 'nav-data' },
    h('button', { type: 'button', class: 'btn data-btn', onclick: () => abrirCalendario(data) },
      h('span', null, '📅 ', fmtLongo(data)), h('small', null, diaSemana(data))),
    data === hoje() ? null : h('button', { type: 'button', class: 'btn', onclick: () => ir('#/hoje') }, 'Hoje'));
}

async function avisoPendentes(data) {
  const pend = (await todosRDOs()).filter((r) => r.data !== data && situacaoRDO(r) === 'pendente');
  if (!pend.length) return null;
  return h('div', { class: 'aviso' }, '⚠️ RDO sem PDF atualizado: ',
    pend.slice(0, 6).map((r, i) => [i ? ', ' : '', h('a', { href: `#/hoje/${r.data}` }, fmtBR(r.data))]), pend.length > 6 ? '…' : '');
}

async function rovsAoVivo(data, cfg) {
  const viz = await mapaVizinhos();
  return (await rovsDoDia(data)).map((r) => resumoROV(r, cfg, viz));
}

export async function viewHoje(dataParam) {
  const data = dataParam || hoje();
  const cfg = await getConfig();
  const rdo = await rdoPorData(data);
  const rovsDia = await rovsDoDia(data);
  const aviso = await avisoPendentes(data);
  const titulo = data === hoje() ? 'RDO de hoje' : `RDO ${fmtBR(data)}`;

  if (!rdo) {
    const ult = await ultimoAnterior(data);
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
            ? `Efetivo, subcontratadas e equipamentos serão copiados do RDO de ${fmtBR(ult.data)}; faltas começam zeradas.`
            : 'Não há RDO anterior: as quantidades começam zeradas.')),
        h('div', { class: 'card' }, h('h3', null, 'Ocorrências de vizinhos nesta data'), blocoVizinhanca(rovsDia, data, cfg)))
    };
  }

  const { el, saver } = editorRDO(rdo, cfg, { readonly: false, rovsDia });
  const apagar = h('div', { class: 'card' },
    h('button', { type: 'button', class: 'btn perigo-txt', style: 'width:100%', onclick: () => fluxoApagar(rdo, saver) }, `🗑️ Apagar RDO de ${fmtBR(rdo.data)}`));
  const barra = h('div', { class: 'barra' },
    h('button', {
      type: 'button', class: 'btn', onclick: async () => {
        await saver.flush();
        const fim = carregando('Gerando prévia…');
        try {
          const blob = await gerarPdfRDO({ ...rdo, status: 'aberto' }, cfg, await rovsAoVivo(rdo.data, cfg));
          fim();
          await verPdf(blob, `PREVIA_RDO_${rdo.data}.pdf`, { aviso: 'Prévia — rascunho, sem validade. Para o documento oficial, use "Gerar PDF".' });
        } catch (e) { fim(); alert('Erro ao gerar PDF: ' + e.message); }
      }
    }, 'Prévia'),
    h('button', { type: 'button', class: 'btn primario', onclick: () => fluxoGerar(rdo, cfg, saver) },
      rdo.versao ? `📄 Gerar PDF v${pad(rdo.versao + 1)}` : '📄 Gerar PDF do dia'));
  return { titulo, aba: 'hoje', el: h('div', null, navData(data), aviso, el, apagar), barra, saver };
}

async function fluxoGerar(rdo, cfg, saver) {
  await saver.flush();
  const pend = checklist(rdo);
  const prox = (rdo.versao || 0) + 1;
  const corpo = h('div', null,
    pend.length
      ? [h('p', null, `Campos vazios (${pend.length}) — apenas aviso:`), h('ul', { class: 'check' }, pend.map((p) => h('li', null, p)))]
      : h('p', null, '✓ Todos os campos principais estão preenchidos.'),
    h('p', { class: 'nota' }, prox > 1
      ? `Será gerada a versão ${pad(prox)} com o mesmo nome de arquivo. Ao salvar no OneDrive, escolha substituir o arquivo anterior.`
      : 'O RDO continua editável. Se mudar algo depois, gere o PDF de novo (nova versão, mesmo nome de arquivo).'));
  const ok = await modal({
    titulo: `Gerar PDF do RDO nº ${pad(rdo.numero, 3)} (v${pad(prox)})?`, corpo,
    botoes: [{ texto: 'Voltar e completar', valor: false }, { texto: 'Gerar PDF', valor: true, classe: 'primario' }]
  });
  if (!ok) return;
  const fim = carregando('Gerando PDF…');
  try {
    const { blob, nome } = await gerarVersao(rdo, cfg, gerarPdfRDO);
    fim();
    rerender();
    await oferecerArquivo(blob, nome, `PDF v${pad(rdo.versao)} pronto ✓`, 'Toque em "Compartilhar…" e escolha OneDrive. Se já existir, substitua.');
  } catch (e) {
    fim();
    console.error(e);
    alert('Não foi possível gerar o PDF: ' + e.message);
  }
}

async function fluxoApagar(rdo, saver) {
  const ok = await confirmar(`Apagar o RDO de ${fmtBR(rdo.data)}?`,
    `O RDO nº ${pad(rdo.numero, 3)}, suas fotos e PDFs serão apagados deste aparelho. Não pode ser desfeito. (PDFs já enviados ao OneDrive não são afetados.)`,
    'Apagar RDO', true);
  if (!ok) return;
  saver.cancel();
  await apagarRDO(rdo);
  toast('RDO apagado.');
  rerender();
}

/** PDF de um RDO (vindo do Histórico): carrega o PDF antes (o toque em Compartilhar precisa ser imediato no iOS). */
export async function viewRdoDetalhe(id) {
  const rdo = await db.get('rdos', id);
  if (!rdo) return { titulo: 'RDO', voltar: true, el: h('p', { class: 'nota' }, 'RDO não encontrado.') };
  const cfg = await getConfig();
  const sit = situacaoRDO(rdo);
  let pdf = null, erro = null;
  if (rdo.versao) {
    try { pdf = await pdfDoRDO(rdo, cfg, (r, c) => gerarPdfRDO(r, c)); } catch (e) { erro = e.message; }
  }
  const { el } = editorRDO(rdo, cfg, { readonly: true, rovsDia: await rovsDoDia(rdo.data) });
  const acoes = h('div', { class: 'card' },
    h('h3', null, `RDO nº ${pad(rdo.numero, 3)} · ${fmtBR(rdo.data)}`),
    !rdo.versao ? h('p', null, 'O PDF deste RDO ainda não foi gerado.')
      : [
        h('p', { class: 'nota' }, `Último PDF: versão ${pad(rdo.versao)}, gerado em ${fmtDataHora(rdo.pdfEm || rdo.fechadoEm)}.`),
        sit === 'pendente' ? h('p', { class: 'aviso' }, 'O RDO foi alterado depois desse PDF. Abra para editar e gere de novo.') : null,
        pdf ? h('p', { class: 'arquivo-nome' }, '📄 ', pdf.nome) : h('p', { class: 'erro' }, 'Erro ao gerar PDF: ' + erro),
        h('div', { class: 'acoes' },
          pdf ? h('button', { type: 'button', class: 'btn primario', onclick: () => { enviarArquivo(pdf.blob, pdf.nome); } }, 'Compartilhar…') : null,
          pdf ? h('button', { type: 'button', class: 'btn', onclick: () => verPdf(pdf.blob, pdf.nome) }, '👁 Ver PDF') : null,
          pdf ? h('button', { type: 'button', class: 'btn', onclick: () => baixarArquivo(pdf.blob, pdf.nome) }, 'Baixar') : null)
      ],
    h('a', { class: 'btn', href: `#/hoje/${rdo.data}`, style: 'width:100%;margin-top:6px' }, '✎ Abrir para editar'));
  return { titulo: `RDO nº ${pad(rdo.numero, 3)}`, voltar: true, aba: 'historico', el: h('div', null, acoes, el) };
}
