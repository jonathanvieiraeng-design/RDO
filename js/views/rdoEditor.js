// Editor do RDO (também usado em modo somente leitura na tela de PDF).
import { h, campo, stepper, segmentado, multiSelecao, areaTexto, texto, secao, galeria, confirmar, toast } from '../ui.js';
import { TEMPO, SITUACOES, itensPara, nomeItem, areasDe, nomesAreas } from '../config.js';
import { salvarRDO, progresso, totaisEfetivo, ultimoAnterior } from '../rdo.js';
import { autosaver, uid, pad, fmtBR, diaSemana, diasDecorridos, diasRestantes, fmtDias, fmtDataHora } from '../util.js';

export function editorRDO(rdo, cfg, { readonly = false, rovsDia = [] } = {}) {
  const cfgUso = readonly ? (rdo.cfgSnapshot || cfg) : cfg;
  const saver = autosaver(() => salvarRDO(rdo));
  const secoes = {};
  const mudou = () => { if (!readonly) saver.touch(); atualiza(); };

  // ---------- cabeçalho ----------
  const barra = h('div', { class: 'progresso-barra' }, h('span'));
  const progTxt = h('span', { class: 'progresso-txt' });
  const dec = diasDecorridos(cfgUso, rdo.data), rest = diasRestantes(cfgUso, rdo.data);
  const cab = h('div', { class: 'card cab-rdo' },
    h('div', { class: 'cab-linha' },
      h('div', null, h('div', { class: 'cab-num' }, `RDO nº ${pad(rdo.numero, 3)}`, rdo.versao ? h('span', { class: 'tag' }, `PDF v${pad(rdo.versao)}`) : null),
        h('div', { class: 'cab-data' }, `${fmtBR(rdo.data)} · ${diaSemana(rdo.data)}`)),
      h('div', { class: 'cab-dias' }, h('div', null, 'Decorridos ', h('b', null, fmtDias(dec))), h('div', null, 'Restantes ', h('b', null, fmtDias(rest))))),
    estadoPdf(rdo),
    readonly
      ? null
      : h('div', { class: 'progresso' }, barra, progTxt),
    (!cfgUso.inicio || !cfgUso.termino) && !readonly ? h('p', { class: 'nota' }, 'Informe início e término da obra em Ajustes para calcular os dias.') : null);

  // ---------- tempo ----------
  const obsPar = texto(rdo.tempo.paralisacaoObs, (v) => { rdo.tempo.paralisacaoObs = v; mudou(); }, { readonly, placeholder: 'Observação da paralisação' });
  obsPar.hidden = rdo.tempo.paralisacao !== 'Sim';
  secoes.tempo = secao('tempo', 'Condições do tempo', h('div', null,
    campo('Manhã', segmentado(TEMPO, rdo.tempo.manha, (v) => { rdo.tempo.manha = v; mudou(); }, { readonly })),
    campo('Tarde', segmentado(TEMPO, rdo.tempo.tarde, (v) => { rdo.tempo.tarde = v; mudou(); }, { readonly })),
    campo('Houve paralisação por chuva?', segmentado(['Sim', 'Não'], rdo.tempo.paralisacao, (v) => { rdo.tempo.paralisacao = v; obsPar.hidden = v !== 'Sim'; mudou(); }, { readonly }), obsPar)));

  // ---------- efetivo ----------
  const totEl = h('div', { class: 'totais' });
  const efCont = h('div');
  const mostrados = new Set(Object.keys(rdo.efetivo));
  let todas = false;
  const temValor = (e) => e && (e.presente > 0 || e.faltas > 0 || (e.obs || '').trim());
  const linhaFuncao = (f) => {
    const get = () => rdo.efetivo[f.id] || { presente: 0, faltas: 0, obs: '' };
    const set = (k, v) => { rdo.efetivo[f.id] = { ...get(), [k]: v }; mostrados.add(f.id); mudou(); };
    return h('div', { class: 'linha-item' },
      h('div', { class: 'li-topo' }, h('span', { class: 'li-nome' }, f.nome), stepper(get().presente, (v) => set('presente', v), { readonly })),
      readonly
        ? ((get().faltas || get().obs) ? h('div', { class: 'li-sub' }, `Faltas: ${get().faltas || 0}`, get().obs ? ` · ${get().obs}` : '') : null)
        : h('div', { class: 'li-sub' }, h('span', { class: 'li-rot' }, 'Faltas'), stepper(get().faltas, (v) => set('faltas', v), { pequeno: true }),
          h('input', { class: 'inp li-obs', placeholder: 'Obs. (ex.: 1 atestado)', value: get().obs, oninput: (e) => set('obs', e.target.value) })));
  };
  const renderEfetivo = () => {
    const lista = itensPara(cfgUso, 'funcoes', Object.keys(rdo.efetivo));
    const ativos = lista.filter((f) => temValor(rdo.efetivo[f.id]) || mostrados.has(f.id));
    const exibir = todas && !readonly ? lista : ativos;
    const ocultas = lista.length - ativos.length;
    efCont.replaceChildren(
      ...exibir.map(linhaFuncao),
      !exibir.length ? h('p', { class: 'nota' }, readonly ? 'Nenhum efetivo registrado.' : 'Nenhuma função com efetivo. Toque em "Mostrar todas".') : null,
      !readonly && (ocultas > 0 || todas) ? h('button', { type: 'button', class: 'btn link', onclick: () => { todas = !todas; renderEfetivo(); } },
        todas ? 'Recolher funções zeradas' : `Mostrar todas as funções (+${ocultas})`) : null,
      totEl);
  };
  renderEfetivo();
  secoes.efetivo = secao('efetivo', 'Efetivo', efCont);

  // ---------- subcontratadas ----------
  const subCont = h('div');
  const renderSubs = () => {
    let lista = itensPara(cfgUso, 'subcontratadas', Object.keys(rdo.subcontratadas));
    if (readonly) lista = lista.filter((s) => rdo.subcontratadas[s.id]?.qtd > 0);
    subCont.replaceChildren(...lista.map((s) => {
      const get = () => rdo.subcontratadas[s.id] || { qtd: 0, obs: '' };
      const set = (k, v) => { rdo.subcontratadas[s.id] = { ...get(), [k]: v }; mudou(); };
      return h('div', { class: 'linha-item' },
        h('div', { class: 'li-topo' }, h('span', { class: 'li-nome' }, s.nome), stepper(get().qtd, (v) => set('qtd', v), { readonly })),
        readonly ? (get().obs ? h('div', { class: 'li-sub' }, get().obs) : null)
          : h('div', { class: 'li-sub' }, h('input', { class: 'inp li-obs', placeholder: 'Observação', value: get().obs, oninput: (e) => set('obs', e.target.value) })));
    }), !lista.length ? h('p', { class: 'nota' }, '—') : null);
  };
  renderSubs();
  secoes.subcontratadas = secao('subcontratadas', 'Subcontratadas', subCont, { aberta: false });

  // ---------- equipamentos ----------
  const eqCont = h('div');
  let eqLista = itensPara(cfgUso, 'equipamentos', Object.keys(rdo.equipamentos));
  if (readonly) eqLista = eqLista.filter((s) => rdo.equipamentos[s.id]?.qtd > 0);
  eqCont.replaceChildren(...eqLista.map((s) => h('div', { class: 'linha-item' },
    h('div', { class: 'li-topo' }, h('span', { class: 'li-nome' }, s.nome),
      stepper(rdo.equipamentos[s.id]?.qtd || 0, (v) => { rdo.equipamentos[s.id] = { qtd: v }; mudou(); }, { readonly })))),
  !eqLista.length ? h('p', { class: 'nota' }, '—') : null);
  secoes.equipamentos = secao('equipamentos', 'Equipamentos', eqCont, { aberta: false });

  // ---------- serviços ----------
  const srvCont = h('div');
  const cardServico = (s, i) => h('div', { class: 'card servico' },
    h('div', { class: 'srv-topo' }, h('strong', null, `Serviço ${i + 1}`),
      readonly ? (s.situacao ? h('span', { class: 'tag' }, s.situacao) : null) : h('button', {
        type: 'button', class: 'btn link perigo-txt',
        onclick: async () => { if (await confirmar(`Remover o serviço ${i + 1}?`, '', 'Remover', true)) { rdo.servicos.splice(i, 1); mudou(); renderServicos(); } }
      }, 'Remover')),
    campo(readonly ? 'Área / pavimento' : 'Área / pavimento (toque em um ou mais)', readonly
      ? h('p', null, nomesAreas(cfgUso, s) || '—')
      : multiSelecao(itensPara(cfgUso, 'pavimentos', areasDe(s)), areasDe(s), (v) => { s.areaIds = v; delete s.areaId; mudou(); })),
    campo('Descrição do serviço', readonly ? h('p', { class: 'pre' }, s.descricao || '—')
      : areaTexto(s.descricao, (v) => { s.descricao = v; mudou(); }, { placeholder: 'Descreva (pode usar o microfone do teclado)' })),
    readonly ? null : campo('Situação', segmentado(SITUACOES, s.situacao, (v) => { s.situacao = v; mudou(); })),
    campo(readonly && !s.fotos.length ? null : 'Fotos do serviço', galeria(s.fotos, { readonly, onChange: mudou, vazio: '' })));
  const renderServicos = () => {
    srvCont.replaceChildren(
      ...rdo.servicos.map(cardServico),
      readonly && !rdo.servicos.length ? h('p', { class: 'nota' }, 'Nenhum serviço registrado.') : null,
      readonly ? null : h('div', { class: 'acoes' },
        h('button', {
          type: 'button', class: 'btn', onclick: () => {
            rdo.servicos.push({ id: uid(), areaIds: [], descricao: '', situacao: null, fotos: [] });
            mudou(); renderServicos();
            const tas = srvCont.querySelectorAll('textarea');
            tas[tas.length - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, '+ Adicionar serviço'),
        h('button', { type: 'button', class: 'btn', onclick: repetirOntem }, '↻ Repetir serviços de ontem')));
  };
  async function repetirOntem() {
    const ant = await ultimoAnterior(rdo.data);
    if (!ant || !ant.servicos.length) { toast('Não há serviços em RDO anterior.'); return; }
    if (!(await confirmar(`Copiar ${ant.servicos.length} serviço(s) do RDO de ${fmtBR(ant.data)}?`, rdo.servicos.length ? 'Serão adicionados aos serviços já lançados. As fotos não são copiadas.' : 'As fotos não são copiadas.', 'Copiar'))) return;
    for (const s of ant.servicos) rdo.servicos.push({ id: uid(), areaIds: [...areasDe(s)], descricao: s.descricao, situacao: s.situacao, fotos: [] });
    mudou(); renderServicos();
  }
  renderServicos();
  secoes.servicos = secao('servicos', 'Serviços executados', srvCont);

  // ---------- observações ----------
  const obs = (rot, k, ph) => campo(rot, readonly ? h('p', { class: 'pre' }, rdo[k] || '—') : areaTexto(rdo[k], (v) => { rdo[k] = v; mudou(); }, { placeholder: ph, linhas: 2 }));
  secoes.observacoes = secao('observacoes', 'Observações', h('div', null,
    obs('Observações da fiscalização', 'fiscalizacao', ''),
    obs('Ocorrências gerais do dia', 'ocorrencias', 'Acidentes, visitas, entregas de material, paralisações…'),
    obs('Conclusão / total de produção do dia', 'producao', '')));

  // ---------- fotos ----------
  secoes.fotos = secao('fotos', 'Fotos do dia', galeria(rdo.fotos, { readonly, onChange: mudou, vazio: 'Nenhuma foto geral.' }));

  // ---------- vizinhança ----------
  const rovs = readonly && rdo.rovSnapshot ? rdo.rovSnapshot : rovsDia;
  secoes.vizinhanca = secao('vizinhanca', 'Ocorrências de vizinhos', blocoVizinhanca(rovs, rdo.data, cfgUso, { podeNovo: !readonly, congelado: readonly && !!rdo.rovSnapshot }));

  function atualiza() {
    const t = totaisEfetivo(rdo);
    totEl.replaceChildren(h('span', null, 'Total presente ', h('b', null, String(t.presentes))), h('span', null, 'Faltas ', h('b', null, String(t.faltas))));
    const p = progresso(rdo);
    barra.firstChild.style.width = `${Math.round((p.feitas / p.total) * 100)}%`;
    progTxt.textContent = `${p.feitas}/${p.total} seções`;
    const ok = p.secoes;
    secoes.tempo.resumo([rdo.tempo.manha, rdo.tempo.tarde].map((x) => x || '—').join(' / '), ok.tempo);
    secoes.efetivo.resumo(`${t.presentes} pres. · ${t.faltas} faltas`, ok.efetivo);
    secoes.subcontratadas.resumo(`${Object.values(rdo.subcontratadas).reduce((s, x) => s + (x.qtd || 0), 0)}`, ok.subcontratadas);
    secoes.equipamentos.resumo(`${Object.values(rdo.equipamentos).reduce((s, x) => s + (x.qtd || 0), 0)}`, ok.equipamentos);
    secoes.servicos.resumo(`${rdo.servicos.length}`, ok.servicos);
    secoes.observacoes.resumo('', ok.observacoes);
    secoes.fotos.resumo(`${rdo.fotos.length}`, ok.fotos);
    secoes.vizinhanca.resumo(`${rovs.length}`, true);
  }
  atualiza();

  const el = h('div', { class: 'editor' }, cab, Object.values(secoes));
  return { el, saver };
}

export function blocoVizinhanca(rovs, data, cfg, { podeNovo = true, congelado = false } = {}) {
  return h('div', null,
    rovs.length
      ? h('div', { class: 'lista' }, rovs.map((r) => h('a', { class: 'item-lista', href: `#/rov/${r.id}` },
        h('div', { class: 'il-topo' }, h('b', null, r.codigo || 'ROV'), h('span', { class: 'badge ' + classeStatus(r) }, r.cancelado ? 'Cancelado' : r.status)),
        h('div', { class: 'il-sub' }, congelado ? [r.vizinho || '—', r.assunto].filter(Boolean).join(' · ') : (r.hora || '') + ' ' + (r.descricao || '').slice(0, 80)))))
      : h('p', { class: 'nota' }, 'Sem ocorrências de vizinhança registradas.'),
    congelado ? h('p', { class: 'nota' }, 'Cópia congelada no fechamento do RDO.') : null,
    podeNovo ? h('a', { class: 'btn', href: `#/rov/novo/${data}` }, '+ Novo ROV nesta data') : null);
}

export function classeStatus(r) {
  if (r.cancelado) return 'cinza';
  return { 'Não resolvido': 'vermelho', 'Em andamento': 'amarelo', 'Resolvido': 'verde' }[r.status] || 'cinza';
}

/** Situação do PDF no cabeçalho do RDO. */
function estadoPdf(rdo) {
  if (!rdo.versao) return h('p', { class: 'nota' }, 'PDF ainda não gerado.');
  const quando = fmtDataHora(rdo.pdfEm || rdo.fechadoEm);
  return rdo.alteradoAposPdf
    ? h('p', { class: 'aviso' }, `PDF v${pad(rdo.versao)} gerado em ${quando}. Houve alterações depois: gere de novo para atualizar.`)
    : h('p', { class: 'nota ok-txt' }, `✓ PDF v${pad(rdo.versao)} gerado em ${quando}.`);
}
