// Ajustes: dados da obra, listas editáveis, backup, armazenamento e modo demonstração.
import { h, campo, texto, modal, confirmar, perguntar, oferecerArquivo, carregando, toast } from '../ui.js';
import { getConfig, salvarConfig, LISTAS, novoItem } from '../config.js';
import * as db from '../db.js';
import { gerarBackup, marcarBackup, lerBackup, aplicarBackup } from '../backup.js';
import { autosaver, fmtDataHora, diasEntre, hoje } from '../util.js';
import { ir } from '../app.js';

export const VERSAO_APP = '1.0.0';

export async function viewAjustes() {
  const cfg = await getConfig();
  const saver = autosaver(() => salvarConfig(cfg));
  const f = (rot, k, opts = {}) => campo(rot, texto(cfg[k], (v) => { cfg[k] = v; saver.touch(); }, opts));
  const dt = (rot, k) => campo(rot, h('input', { type: 'date', class: 'inp', value: cfg[k], onchange: (e) => { cfg[k] = e.target.value; saver.touch(); } }));

  const ult = await db.getMeta('ultimoBackup');
  const diasBk = ult ? diasEntre(ult.slice(0, 10), hoje()) : null;
  const persistido = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null;
  let uso = '';
  try { const e = await navigator.storage.estimate(); uso = `${(e.usage / 1048576).toFixed(1)} MB usados`; } catch { /* ok */ }

  const inpImport = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'oculto-input', onchange: async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try {
        const d = await lerBackup(file);
        const ok = await confirmar('Importar backup?',
          `Backup de ${fmtDataHora(d.exportadoEm)} (${d.rdos?.length || 0} RDOs, ${d.rovs?.length || 0} ROVs, ${d.fotos?.length || 0} fotos). TODOS os dados atuais deste modo serão substituídos.`, 'Substituir dados', true);
        if (!ok) return;
        const fim = carregando('Importando…');
        try { const r = await aplicarBackup(d); fim(); toast(`Importado: ${r.rdos} RDOs, ${r.rovs} ROVs, ${r.fotos} fotos.`); ir('#/hoje', true); } catch (err) { fim(); throw err; }
      } catch (err) { alert('Falha ao importar: ' + err.message); }
    }
  });

  const el = h('div', null,
    h('div', { class: 'card' }, h('h3', null, 'Dados da obra'),
      f('Nome da obra', 'nome'),
      f('Nome curto para arquivos (sem espaços)', 'siglaArquivo', { placeholder: 'Ex.: MonteFuji' }),
      f('Unidade construtiva', 'unidade'),
      f('Tipo de obra', 'tipo'),
      f('Endereço', 'endereco'),
      f('Contratante / construtora', 'contratante'),
      h('div', { class: 'grade2' }, dt('Início da obra', 'inicio'), dt('Término previsto', 'termino')),
      f('Responsável pelo preenchimento', 'responsavel'),
      f('Registro profissional', 'registro')),
    h('div', { class: 'card' }, h('h3', null, 'Listas editáveis'),
      h('div', { class: 'lista' }, Object.entries(LISTAS).map(([k, t]) => h('a', { class: 'item-lista', href: `#/ajustes/lista/${k}` },
        h('div', { class: 'il-topo' }, h('b', null, t), h('span', { class: 'nota' }, `${cfg.listas[k].filter((i) => !i.oculto).length} ativos ›`)))))),
    h('div', { class: 'card' }, h('h3', null, 'Backup'),
      h('p', { class: diasBk == null || diasBk > 7 ? 'aviso' : 'nota' }, ult ? `Último backup exportado: ${fmtDataHora(ult)} (há ${diasBk} dia(s)).` : 'Nenhum backup exportado ainda.'),
      h('p', { class: 'nota' }, 'O iOS pode apagar dados de apps web em situações extremas. Exporte o backup com frequência e guarde no OneDrive.'),
      h('div', { class: 'acoes' },
        h('button', {
          type: 'button', class: 'btn primario', onclick: async () => {
            const fim = carregando('Preparando backup…');
            try { const b = await gerarBackup(); fim(); await marcarBackup(); await oferecerArquivo(b.blob, b.nome, 'Backup pronto', `${b.fotos} foto(s) incluída(s). Salve no OneDrive ou em Arquivos.`); ir('#/ajustes', true); } catch (e) { fim(); alert('Erro no backup: ' + e.message); }
          }
        }, '⬇️ Exportar backup'),
        h('label', { class: 'btn' }, '⬆️ Importar backup', inpImport))),
    h('div', { class: 'card' }, h('h3', null, 'Armazenamento'),
      h('p', { class: 'nota' }, persistido === true ? '✓ Armazenamento persistente concedido.' : persistido === false ? 'Armazenamento persistente não concedido (instale na Tela de Início).' : 'Status de persistência indisponível.', uso ? ` ${uso}.` : '')),
    h('div', { class: 'card' }, h('h3', null, 'Modo demonstração'),
      h('p', { class: 'nota' }, db.modoDemo()
        ? 'LIGADO: você está vendo um banco de dados separado com dados de exemplo. Seus dados reais não são afetados.'
        : 'Desligado. Ao ligar, o app troca para um banco separado com o ROV de referência (Marisa, 16/06/26) e um RDO de exemplo.'),
      h('button', {
        type: 'button', class: 'btn', onclick: async () => {
          const on = !db.modoDemo();
          if (!(await confirmar(on ? 'Ligar modo demonstração?' : 'Voltar aos dados reais?', on ? 'Os dados reais ficam intactos.' : ''))) return;
          await saver.flush();
          db.definirModoDemo(on);
          location.hash = '#/hoje';
          location.reload();
        }
      }, db.modoDemo() ? 'Desligar demonstração' : 'Ligar demonstração')),
    h('p', { class: 'nota centro' }, `RDO + ROV v${VERSAO_APP} · funciona offline · fonte Carlito (OFL)`));
  return { titulo: 'Ajustes', aba: 'ajustes', el, saver };
}

/** Verifica se um item de lista foi usado em algum RDO/ROV (aí não pode ser excluído, só ocultado). */
async function itemUsado(lista, id) {
  if (lista === 'assuntos') return (await db.all('rovs')).some((r) => r.assuntoId === id);
  const rdos = await db.all('rdos');
  if (lista === 'pavimentos') return rdos.some((r) => r.servicos.some((s) => s.areaId === id));
  const campo = { funcoes: 'efetivo', subcontratadas: 'subcontratadas', equipamentos: 'equipamentos' }[lista];
  return rdos.some((r) => r[campo] && id in r[campo]);
}

export async function viewLista(chave) {
  const cfg = await getConfig();
  const itens = cfg.listas[chave];
  if (!itens) return { titulo: 'Lista', voltar: true, el: h('p', null, 'Lista inexistente.') };
  const saver = autosaver(() => salvarConfig(cfg));
  const cont = h('div', { class: 'lista' });
  const render = async () => {
    const usados = new Set();
    for (const i of itens) if (await itemUsado(chave, i.id)) usados.add(i.id);
    cont.replaceChildren(...itens.map((it, idx) => h('div', { class: 'item-lista edit' + (it.oculto ? ' oculto' : '') },
      h('input', { class: 'inp', value: it.nome, oninput: (e) => { it.nome = e.target.value; saver.touch(); } }),
      h('div', { class: 'acoes' },
        h('button', { type: 'button', class: 'btn ic', disabled: idx === 0, 'aria-label': 'subir', onclick: () => { itens.splice(idx - 1, 0, itens.splice(idx, 1)[0]); saver.touch(); render(); } }, '↑'),
        h('button', { type: 'button', class: 'btn ic', disabled: idx === itens.length - 1, 'aria-label': 'descer', onclick: () => { itens.splice(idx + 1, 0, itens.splice(idx, 1)[0]); saver.touch(); render(); } }, '↓'),
        h('button', { type: 'button', class: 'btn', onclick: () => { it.oculto = !it.oculto; saver.touch(); render(); } }, it.oculto ? 'Mostrar' : 'Ocultar'),
        usados.has(it.id)
          ? h('span', { class: 'nota' }, 'em uso')
          : h('button', { type: 'button', class: 'btn link perigo-txt', onclick: async () => { if (await confirmar(`Excluir "${it.nome}"?`, 'Item nunca usado.', 'Excluir', true)) { itens.splice(idx, 1); saver.touch(); render(); } } }, 'Excluir')))));
  };
  await render();
  return {
    titulo: LISTAS[chave], voltar: true, aba: 'ajustes', saver,
    el: h('div', null,
      h('p', { class: 'nota' }, 'Itens já usados em algum registro não podem ser excluídos — apenas ocultados. Renomear não altera RDOs já fechados.'),
      h('button', { type: 'button', class: 'btn primario', onclick: async () => { const n = await perguntar('Novo item', { rotulo: 'Nome', obrigatorio: true, multilinha: false, ok: 'Adicionar' }); if (n) { itens.push(novoItem(n)); saver.touch(); render(); } } }, '+ Adicionar item'),
      cont)
  };
}
