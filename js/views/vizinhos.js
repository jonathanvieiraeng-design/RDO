// Módulo ROV: lista com filtros, editor de ocorrência e cadastro de vizinhos.
import { h, campo, segmentado, areaTexto, texto, galeria, modal, confirmar, perguntar, oferecerArquivo, carregando, toast } from '../ui.js';
import { getConfig, CANAIS, TIPOS_ROV, STATUS_ROV, itensPara, nomeItem } from '../config.js';
import * as db from '../db.js';
import { novoROV, salvarROV, mudarStatus, cancelarROV, listarROVs, filtrar, mapaVizinhos, salvarVizinho, estaAberto } from '../rov.js';
import { gerarPdfROV } from '../pdf.js';
import { autosaver, fmtBR, fmtDataHora, hoje, slugArquivo } from '../util.js';
import { classeStatus } from './rdoEditor.js';
import { ir, atualizarBadge } from '../app.js';

let filtros = { ini: '', fim: '', status: '', vizinhoId: '', assuntoId: '', cancelados: false };
try { filtros = { ...filtros, ...JSON.parse(sessionStorage.getItem('rov-filtros') || '{}') }; } catch { /* ok */ }
const guardaFiltros = () => { try { sessionStorage.setItem('rov-filtros', JSON.stringify(filtros)); } catch { /* ok */ } };

export async function viewVizinhos() {
  const cfg = await getConfig();
  const todos = await listarROVs();
  const viz = await mapaVizinhos();
  const abertos = todos.filter(estaAberto).length;
  const listaEl = h('div', { class: 'lista' });
  const contEl = h('span');
  const sel = (valor, ops, onCh, vazio) => h('select', { class: 'inp', onchange: (e) => onCh(e.target.value) },
    h('option', { value: '' }, vazio), ops.map((o) => h('option', { value: o.id, selected: o.id === valor ? true : null }, o.nome)));

  const render = () => {
    const l = filtrar(todos, filtros);
    contEl.textContent = `${l.length} ocorrência(s)`;
    listaEl.replaceChildren(...(l.length ? l.map((r) => h('a', { class: 'item-lista', href: `#/rov/${r.id}` },
      h('div', { class: 'il-topo' }, h('b', null, r.codigo), h('span', null, fmtBR(r.data), r.hora ? ' ' + r.hora : ''),
        h('span', { class: 'badge ' + classeStatus(r) }, r.cancelado ? 'Cancelado' : r.status)),
      h('div', { class: 'il-sub' }, [viz.get(r.vizinhoId)?.nome || 'Vizinho não informado', nomeItem(cfg, 'assuntos', r.assuntoId), r.tipo].filter(Boolean).join(' · ')),
      r.descricao ? h('div', { class: 'il-desc' }, r.descricao.slice(0, 120)) : null)) : [h('p', { class: 'nota' }, 'Nenhuma ocorrência com estes filtros.')]));
  };
  const atual = (k) => (v) => { filtros[k] = v; guardaFiltros(); render(); };
  const ativos = ['ini', 'fim', 'status', 'vizinhoId', 'assuntoId'].filter((k) => filtros[k]).length + (filtros.cancelados ? 1 : 0);

  const filtrosEl = h('details', { class: 'secao', open: ativos ? true : null },
    h('summary', null, h('span', { class: 'sec-tit' }, 'Filtros'), h('span', { class: 'sec-resumo' }, ativos ? `${ativos} ativo(s)` : 'nenhum')),
    h('div', { class: 'sec-corpo' },
      h('div', { class: 'grade2' },
        campo('De', h('input', { type: 'date', class: 'inp', value: filtros.ini, onchange: (e) => atual('ini')(e.target.value) })),
        campo('Até', h('input', { type: 'date', class: 'inp', value: filtros.fim, onchange: (e) => atual('fim')(e.target.value) }))),
      campo('Status', sel(filtros.status, STATUS_ROV.map((s) => ({ id: s, nome: s })), atual('status'), 'Todos')),
      campo('Vizinho', sel(filtros.vizinhoId, [...viz.values()].sort((a, b) => a.nome.localeCompare(b.nome)), atual('vizinhoId'), 'Todos')),
      campo('Assunto', sel(filtros.assuntoId, cfg.listas.assuntos, atual('assuntoId'), 'Todos')),
      h('label', { class: 'check-linha' }, h('input', { type: 'checkbox', checked: filtros.cancelados, onchange: (e) => atual('cancelados')(e.target.checked) }), ' Incluir cancelados'),
      h('button', { type: 'button', class: 'btn link', onclick: () => { filtros = { ini: '', fim: '', status: '', vizinhoId: '', assuntoId: '', cancelados: false }; guardaFiltros(); ir('#/vizinhos', true); } }, 'Limpar filtros')));

  const gerar = async () => {
    const l = filtrar(todos, filtros).slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    if (!l.length) { toast('Nenhuma ocorrência no filtro.'); return; }
    const ini = filtros.ini || l[0].data, fim = filtros.fim || l[l.length - 1].data;
    const fimLoad = carregando('Gerando relatório ROV…');
    try {
      const blob = await gerarPdfROV(l, { ini, fim }, cfg, viz);
      fimLoad();
      await oferecerArquivo(blob, `ROV_${slugArquivo(cfg.siglaArquivo || cfg.nome)}_${ini}_a_${fim}.pdf`, 'Relatório ROV pronto');
    } catch (e) { fimLoad(); alert('Erro ao gerar PDF: ' + e.message); }
  };

  render();
  return {
    titulo: 'Vizinhos (ROV)', aba: 'vizinhos',
    el: h('div', null,
      h('div', { class: 'indicador' + (abertos ? ' alerta' : '') }, h('b', null, String(abertos)), abertos === 1 ? ' ocorrência aberta' : ' ocorrências abertas', h('small', null, ' (não resolvido + em andamento)')),
      h('div', { class: 'acoes' }, h('a', { class: 'btn primario', href: '#/rov/novo' }, '+ Novo ROV'), h('a', { class: 'btn', href: '#/cadastro-vizinhos' }, '👥 Vizinhos cadastrados')),
      filtrosEl,
      h('div', { class: 'lista-cab' }, contEl, h('button', { type: 'button', class: 'btn', onclick: gerar }, '📄 Relatório do filtro')),
      listaEl)
  };
}

// ---------------------------------------------------------------------
export async function viewRovEditor(id, dataNovo) {
  const cfg = await getConfig();
  let rov = id ? await db.get('rovs', id) : novoROV(dataNovo);
  if (!rov) return { titulo: 'ROV', voltar: true, el: h('p', { class: 'nota' }, 'Ocorrência não encontrada.') };
  const viz = await mapaVizinhos();
  const readonly = !!rov.cancelado;
  const tituloEl = h('span', null, rov.codigo || 'Novo ROV');
  const fixaEndereco = () => {
    tituloEl.textContent = rov.codigo; document.getElementById('titulo').textContent = rov.codigo;
    if (location.hash !== `#/rov/${rov.id}`) history.replaceState(null, '', `#/rov/${rov.id}`); // não recria ao re-renderizar
  };
  const saver = autosaver(async () => { await salvarROV(rov); fixaEndereco(); atualizarBadge(); });
  const mudou = () => saver.touch();

  // vizinho
  const infoViz = h('p', { class: 'nota' });
  const selViz = h('select', { class: 'inp', disabled: readonly });
  const montaSelViz = () => {
    selViz.replaceChildren(h('option', { value: '' }, '— selecione —'),
      [...viz.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map((v) => h('option', { value: v.id, selected: v.id === rov.vizinhoId ? true : null }, v.nome + (v.endereco ? ` (${v.endereco})` : ''))));
    const v = viz.get(rov.vizinhoId);
    infoViz.textContent = v ? [v.endereco && `Nº casa/apto/prédio: ${v.endereco}`, v.telefone && `Tel.: ${v.telefone}`].filter(Boolean).join(' · ') : '';
  };
  selViz.addEventListener('change', () => { rov.vizinhoId = selViz.value || null; montaSelViz(); mudou(); });
  montaSelViz();
  const novoViz = async () => {
    const v = await editarVizinho({});
    if (v) { viz.set(v.id, v); rov.vizinhoId = v.id; montaSelViz(); mudou(); }
  };

  // status
  const dataRes = h('input', { type: 'date', class: 'inp', value: rov.dataResolucao, disabled: readonly, onchange: (e) => { if (!e.target.value) { e.target.value = rov.dataResolucao; return; } rov.dataResolucao = e.target.value; mudou(); } });
  const campoRes = campo('Data de resolução', dataRes);
  campoRes.hidden = rov.status !== 'Resolvido';
  const histEl = h('div');
  const renderHist = () => histEl.replaceChildren(rov.historico.length
    ? h('ul', { class: 'historico' }, rov.historico.map((x) => h('li', null, h('b', null, fmtDataHora(x.em)), ' — ', x.de ? `${x.de} → ` : '', x.para, x.nota ? ` · ${x.nota}` : '')))
    : h('p', { class: 'nota' }, 'O histórico começa ao salvar.'));
  renderHist();
  const segStatus = segmentado(STATUS_ROV, rov.status, () => {}, {
    readonly, limpar: false,
    antes: async (novo) => {
      const nota = h('textarea', { class: 'txt', rows: '2', placeholder: 'Nota (opcional)' });
      const dt = h('input', { type: 'date', class: 'inp', value: hoje() });
      const erro = h('p', { class: 'erro', hidden: true }, 'Informe a data de resolução.');
      const ok = await modal({
        titulo: `Status: ${rov.status} → ${novo}`,
        corpo: h('div', null, novo === 'Resolvido' ? campo('Data de resolução (obrigatória)', dt) : null, campo('Nota', nota), erro),
        botoes: [{ texto: 'Cancelar', valor: false }, { texto: 'Confirmar', classe: 'primario', valor: true, validar: () => { if (novo === 'Resolvido' && !dt.value) { erro.hidden = false; return false; } return true; } }]
      });
      if (!ok) return false;
      await saver.flush();
      await mudarStatus(rov, novo, nota.value.trim(), dt.value);
      dataRes.value = rov.dataResolucao; campoRes.hidden = novo !== 'Resolvido';
      fixaEndereco();
      renderHist(); atualizarBadge();
      return true;
    }
  });

  const usadosAss = [rov.assuntoId].filter(Boolean);
  const el = h('div', { class: 'editor' },
    rov.cancelado ? h('div', { class: 'aviso' }, `Cancelado em ${fmtDataHora(rov.cancelado.em)} — ${rov.cancelado.motivo}`) : null,
    h('div', { class: 'card' },
      h('div', { class: 'grade2' },
        campo('Data', h('input', { type: 'date', class: 'inp', value: rov.data, disabled: readonly, onchange: (e) => { if (e.target.value) { rov.data = e.target.value; mudou(); } } })),
        campo('Hora', h('input', { type: 'time', class: 'inp', value: rov.hora, disabled: readonly, onchange: (e) => { rov.hora = e.target.value; mudou(); } }))),
      campo('Vizinho', h('div', { class: 'linha-btn' }, selViz, readonly ? null : h('button', { type: 'button', class: 'btn', onclick: novoViz }, '+ Novo')), infoViz),
      campo('Canal do contato', segmentado(CANAIS, rov.canal, (v) => { rov.canal = v; mudou(); }, { readonly })),
      campo('Tipo de ocorrência', segmentado(TIPOS_ROV, rov.tipo, (v) => { rov.tipo = v; mudou(); }, { readonly })),
      campo('Assunto', segmentado(itensPara(cfg, 'assuntos', usadosAss), rov.assuntoId, (v) => { rov.assuntoId = v; mudou(); }, { readonly, chips: true }))),
    h('div', { class: 'card' },
      campo('Descrição da ocorrência', areaTexto(rov.descricao, (v) => { rov.descricao = v; mudou(); }, { readonly, linhas: 4, placeholder: 'O que o vizinho relatou' })),
      campo('Esclarecimento / ação tomada', areaTexto(rov.acao, (v) => { rov.acao = v; mudou(); }, { readonly, linhas: 3 }))),
    h('div', { class: 'card' },
      campo('Status', segStatus), campoRes,
      campo('Evidências (fotos e prints)', galeria(rov.fotos, { readonly, onChange: mudou, vazio: 'Sem evidências.' }))),
    h('div', { class: 'card' }, h('h3', null, 'Histórico de status'), histEl),
    !readonly && rov.seq ? h('button', {
      type: 'button', class: 'btn perigo-txt link', onclick: async () => {
        const motivo = await perguntar(`Cancelar ${rov.codigo}?`, { rotulo: 'Motivo do cancelamento (obrigatório)', obrigatorio: true, ok: 'Cancelar ROV', ajuda: 'O registro não é apagado: fica marcado como cancelado.' });
        if (!motivo) return;
        await saver.flush();
        await cancelarROV(rov, motivo);
        atualizarBadge();
        ir(`#/rov/${rov.id}`, true);
      }
    }, 'Cancelar este ROV') : null);
  return { titulo: rov.codigo || 'Novo ROV', voltar: true, aba: 'vizinhos', el, saver };
}

// ---------------------------------------------------------------------
async function editarVizinho(v) {
  const nome = h('input', { class: 'inp', value: v.nome || '', placeholder: 'Nome' });
  const end = h('input', { class: 'inp', value: v.endereco || '', placeholder: 'Ex.: Fundos – Monte Fuji, Casa nº 12' });
  const tel = h('input', { class: 'inp', type: 'tel', value: v.telefone || '', placeholder: 'Opcional' });
  const erro = h('p', { class: 'erro', hidden: true }, 'Informe o nome.');
  const ok = await modal({
    titulo: v.id ? 'Editar vizinho' : 'Novo vizinho',
    corpo: h('div', null, campo('Nome', nome), campo('Endereço / referência (nº casa/apto/prédio)', end), campo('Telefone', tel), erro),
    botoes: [{ texto: 'Cancelar', valor: false }, { texto: 'Salvar', classe: 'primario', valor: true, validar: () => { if (!nome.value.trim()) { erro.hidden = false; return false; } return true; } }]
  });
  if (!ok) return null;
  return salvarVizinho({ ...v, nome: nome.value.trim(), endereco: end.value.trim(), telefone: tel.value.trim() });
}

export async function viewCadastroVizinhos() {
  const lista = h('div', { class: 'lista' });
  const render = async () => {
    const viz = [...(await mapaVizinhos()).values()].sort((a, b) => a.nome.localeCompare(b.nome));
    const rovs = await db.all('rovs');
    lista.replaceChildren(...(viz.length ? viz.map((v) => {
      const n = rovs.filter((r) => r.vizinhoId === v.id).length;
      return h('div', { class: 'item-lista' },
        h('div', { class: 'il-topo' }, h('b', null, v.nome), h('span', { class: 'nota' }, `${n} ROV`)),
        h('div', { class: 'il-sub' }, [v.endereco, v.telefone].filter(Boolean).join(' · ') || '—'),
        h('div', { class: 'acoes' },
          h('button', { type: 'button', class: 'btn', onclick: async () => { if (await editarVizinho(v)) render(); } }, 'Editar'),
          n === 0 ? h('button', { type: 'button', class: 'btn link perigo-txt', onclick: async () => { if (await confirmar(`Excluir ${v.nome}?`, 'Sem ocorrências vinculadas.', 'Excluir', true)) { await db.del('vizinhos', v.id); render(); } } }, 'Excluir') : null));
    }) : [h('p', { class: 'nota' }, 'Nenhum vizinho cadastrado.')]));
  };
  await render();
  return {
    titulo: 'Vizinhos cadastrados', voltar: true, aba: 'vizinhos',
    el: h('div', null, h('button', { type: 'button', class: 'btn primario', onclick: async () => { if (await editarVizinho({})) render(); } }, '+ Novo vizinho'), lista)
  };
}
