// Histórico de RDOs, com busca por data.
import { h } from '../ui.js';
import { todosRDOs, situacaoRDO } from '../rdo.js';
import { fmtBR, diaSemana, fmtDataHora, pad } from '../util.js';
import { ir } from '../app.js';

let busca = '';

export async function viewHistorico() {
  const lista = await todosRDOs();
  const cont = h('div', { class: 'lista' });
  const render = () => {
    const l = busca ? lista.filter((r) => r.data === busca) : lista;
    cont.replaceChildren(...(l.length ? l.map((r) => {
      const sit = situacaoRDO(r);
      const selo = !r.versao ? ['amarelo', 'Sem PDF'] : sit === 'gerado' ? ['verde', `PDF v${pad(r.versao)}`] : ['amarelo', `Alterado após v${pad(r.versao)}`];
      return h('a', { class: 'item-lista', href: `#/rdo/${r.id}` },
        h('div', { class: 'il-topo' }, h('b', null, `Nº ${pad(r.numero, 3)}`), h('span', null, `${fmtBR(r.data)} · ${diaSemana(r.data).split('-')[0]}`),
          h('span', { class: 'badge ' + selo[0] }, selo[1])),
        h('div', { class: 'il-sub' }, r.versao ? `Último PDF em ${fmtDataHora(r.pdfEm || r.fechadoEm)}` : 'Em preenchimento'));
    }) : [h('p', { class: 'nota' }, busca ? 'Nenhum RDO nesta data.' : 'Nenhum RDO ainda.')]));
  };
  render();
  return {
    titulo: 'Histórico', aba: 'historico',
    el: h('div', null,
      h('div', { class: 'linha-btn' },
        h('input', { type: 'date', class: 'inp', value: busca, 'aria-label': 'buscar por data', onchange: (e) => { busca = e.target.value; render(); } }),
        h('button', { type: 'button', class: 'btn', onclick: () => { busca = ''; ir('#/historico', true); } }, 'Limpar')),
      h('p', { class: 'nota' }, `${lista.length} RDO(s). Toque para ver o PDF, compartilhar ou abrir para editar.`),
      cont)
  };
}
