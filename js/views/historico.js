// Histórico de RDOs (todas as versões), com busca por data.
import { h } from '../ui.js';
import * as db from '../db.js';
import { fmtBR, diaSemana, fmtDataHora, pad } from '../util.js';
import { ir } from '../app.js';

let busca = '';

export async function viewHistorico() {
  const todos = await db.all('rdos');
  const grupos = new Map();
  for (const r of todos) { if (!grupos.has(r.numero)) grupos.set(r.numero, []); grupos.get(r.numero).push(r); }
  const lista = [...grupos.values()].map((vs) => vs.sort((a, b) => b.rev - a.rev)).sort((a, b) => b[0].data.localeCompare(a[0].data) || b[0].numero - a[0].numero);
  const cont = h('div', { class: 'lista' });
  const render = () => {
    const l = busca ? lista.filter((vs) => vs[0].data === busca) : lista;
    cont.replaceChildren(...(l.length ? l.map((vs) => {
      const u = vs[0];
      return h('a', { class: 'item-lista', href: `#/rdo/${u.id}` },
        h('div', { class: 'il-topo' }, h('b', null, `Nº ${pad(u.numero, 3)}`), h('span', null, `${fmtBR(u.data)} · ${diaSemana(u.data).split('-')[0]}`),
          h('span', { class: 'badge ' + (u.status === 'fechado' ? 'cinza' : 'amarelo') }, u.status === 'fechado' ? (u.rev ? `Fechado · Rev. ${pad(u.rev)}` : 'Fechado') : (u.rev ? `Rev. ${pad(u.rev)} aberta` : 'Aberto'))),
        h('div', { class: 'il-sub' }, u.status === 'fechado' ? `Fechado em ${fmtDataHora(u.fechadoEm)}` : 'Em preenchimento', vs.length > 1 ? ` · ${vs.length} versões` : ''));
    }) : [h('p', { class: 'nota' }, busca ? 'Nenhum RDO nesta data.' : 'Nenhum RDO ainda.')]));
  };
  render();
  return {
    titulo: 'Histórico', aba: 'historico',
    el: h('div', null,
      h('div', { class: 'linha-btn' },
        h('input', { type: 'date', class: 'inp', value: busca, 'aria-label': 'buscar por data', onchange: (e) => { busca = e.target.value; render(); } }),
        h('button', { type: 'button', class: 'btn', onclick: () => { busca = ''; ir('#/historico', true); } }, 'Limpar')),
      h('p', { class: 'nota' }, `${lista.length} RDO(s). Toque para ver, abrir o PDF, compartilhar ou criar revisão.`),
      cont)
  };
}
