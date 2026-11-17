// Configuração da obra e listas editáveis.
import * as db from './db.js';
import { nowISO, uid } from './util.js';

export const TEMPO = ['Sol', 'Nublado', 'Chuva', 'Chuva forte'];
export const SITUACOES = ['Iniciado', 'Em andamento', 'Concluído'];
export const CANAIS = ['Presencial', 'WhatsApp', 'Telefone', 'Outro'];
export const TIPOS_ROV = ['Reclamação', 'Pedido', 'Sugestão', 'Informação'];
export const STATUS_ROV = ['Não resolvido', 'Em andamento', 'Resolvido'];
export const STATUS_ABERTOS = ['Não resolvido', 'Em andamento'];

export const LISTAS = {
  pavimentos: 'Pavimentos / áreas',
  funcoes: 'Funções do efetivo',
  subcontratadas: 'Subcontratadas',
  equipamentos: 'Equipamentos',
  assuntos: 'Assuntos de ROV'
};

// Listas padrão com ids estáveis (o id nunca muda; só o nome é exibido).
// Pavimentos do Residencial Monte Fuji; funções e equipamentos ajustados pelo usuário em 17/11/2026.
const PAV_MONTE_FUJI = [
  ['pav_1', 'Subsolo'], ['pav_2', 'Térreo'], ['pav_9', 'G1'], ['pav_10', 'G2'], ['pav_11', 'G3'], ['pav_12', 'Mezanino'],
  ...Array.from({ length: 15 }, (_, i) => [i < 3 ? `pav_${3 + i}` : `pav_${13 + i}`, `${i + 1}º Pav`]),
  ['pav_28', 'Churrasqueira/Piscina'], ['pav_29', 'Ático'], ['pav_30', 'Casa de máquinas'], ['pav_31', "Caixa d'água"]
];
const PADRAO = {
  pavimentos: PAV_MONTE_FUJI,
  funcoes: [['fun_1', 'Engenheiro'], ['fun_2', 'Estagiário'], ['fun_4', 'Tec. de Segurança'], ['fun_5', 'Encarregado/Mestre'],
    ['fun_8', 'Pedreiro'], ['fun_9', 'Ajudante'], ['fun_10', 'Carpinteiro'], ['fun_11', 'Armador'], ['fun_12', 'Eletricista'],
    ['fun_14', 'Encanador'], ['fun_15', 'Azulejista'], ['fun_16', 'Pintor'], ['fun_17', 'Impermeabilizador'], ['fun_18', 'Fachadeiro'],
    ['fun_19', 'Gesseiro'], ['fun_21', 'Serralheiro'], ['fun_22', 'Marmorista'], ['fun_20', 'Guincheiro']],
  subcontratadas: [['sub_1', 'Elevadores'], ['sub_2', 'Instalação de gás'], ['sub_3', 'Instalação de combate a incêndio']],
  equipamentos: [['eqp_1', 'Serra de bancada'], ['eqp_2', 'Vibradores'], ['eqp_3', 'Mangotes do vibrador'], ['eqp_5', 'Serra mármore'],
    ['eqp_6', 'Guincho'], ['eqp_7', 'Betoneira/Masseira/Silo'], ['eqp_8', 'Balancins'], ['eqp_9', 'Nível a laser'],
    ['eqp_10', 'Furadeira de impacto'], ['eqp_11', 'Policorte'], ['eqp_12', 'Serra circular']],
  assuntos: [['ass_1', 'Vibração'], ['ass_2', 'Ruído'], ['ass_3', 'Poeira'], ['ass_4', 'Sujeira na via'], ['ass_5', 'Dano em imóvel'],
    ['ass_6', 'Horário'], ['ass_7', 'Outros']]
};

export function listasPadrao() {
  const o = {};
  for (const [k, itens] of Object.entries(PADRAO)) o[k] = itens.map(([id, nome]) => ({ id, nome, oculto: false }));
  return o;
}

// Migração 1 (v1.2.0): aplica as listas acima numa configuração já salva no aparelho.
// Itens retirados que já foram usados em algum RDO ficam ocultos (rastreabilidade); os não usados saem da lista.
// Itens criados pelo usuário são mantidos.
const RETIRADOS = {
  pavimentos: ['pav_6', 'pav_7', 'pav_8'],
  funcoes: ['fun_3', 'fun_6', 'fun_7', 'fun_13'],
  equipamentos: ['eqp_4']
};
async function migrarListas(c) {
  if ((c.migracao || 0) >= 1) return false;
  const rdos = await db.all('rdos');
  const usado = (k, id) => k === 'pavimentos'
    ? rdos.some((r) => (r.servicos || []).some((s) => areasDe(s).includes(id)))
    : rdos.some((r) => r[k === 'funcoes' ? 'efetivo' : 'equipamentos'] && id in r[k === 'funcoes' ? 'efetivo' : 'equipamentos']);
  const pad = listasPadrao();
  for (const k of Object.keys(RETIRADOS)) {
    const atual = c.listas[k] || [];
    const porId = new Map(atual.map((i) => [i.id, i]));
    const novo = pad[k].map((p) => porId.get(p.id) || p);
    for (const i of atual) {
      if (pad[k].some((p) => p.id === i.id)) continue;
      if (RETIRADOS[k].includes(i.id)) { if (usado(k, i.id)) novo.push({ ...i, oculto: true }); }
      else novo.push(i); // item do usuário
    }
    c.listas[k] = novo;
  }
  c.migracao = 1;
  return true;
}

// Dados da obra vêm do ROV (Monte Fuji) e do usuário (responsável e CREA). Datas e contratante ficam vazios.
export function configPadrao() {
  const agora = nowISO();
  return {
    id: 'obra',
    nome: 'Residencial Monte Fuji',
    siglaArquivo: 'MonteFuji',
    unidade: '120 apartamentos + lazer',
    tipo: 'Edifício residencial multifamiliar',
    endereco: 'R. Balneária, 49 – Praia Grande/SP',
    contratante: '',
    inicio: '',
    termino: '',
    responsavel: 'Jonathan Vieira – Eng. Civil',
    registro: 'CREA-SP 5070007635',
    listas: listasPadrao(),
    migracao: 1,
    criadoEm: agora,
    atualizadoEm: agora
  };
}

let cache = null;
export async function getConfig() {
  if (cache) return cache;
  let c = await db.get('config', 'obra');
  if (!c) { c = configPadrao(); await db.put('config', c); }
  const pad = listasPadrao();
  for (const k of Object.keys(LISTAS)) if (!Array.isArray(c.listas?.[k])) { c.listas = c.listas || {}; c.listas[k] = pad[k]; }
  if (await migrarListas(c)) await db.put('config', c);
  cache = c;
  return c;
}
export async function salvarConfig(c) { c.atualizadoEm = nowISO(); cache = c; await db.put('config', c); }
export function limparCacheConfig() { cache = null; }

export function novoItem(nome) { return { id: uid(), nome, oculto: false }; }
export function nomeItem(cfg, lista, id) {
  if (!id) return '';
  return cfg?.listas?.[lista]?.find((i) => i.id === id)?.nome ?? '(item removido)';
}
/** Itens visíveis + itens ocultos que já estão em uso no registro atual. */
export function itensPara(cfg, lista, usados = []) {
  return cfg.listas[lista].filter((i) => !i.oculto || usados.includes(i.id));
}

/** Pavimentos de um serviço (um serviço pode abranger vários). Aceita o formato antigo (areaId único). */
export function areasDe(s) {
  if (Array.isArray(s?.areaIds)) return s.areaIds;
  return s?.areaId ? [s.areaId] : [];
}
/** Nomes dos pavimentos de um serviço, na ordem da lista. Ex.: "1º Pav, 4º Pav, 5º Pav". */
export function nomesAreas(cfg, s) {
  const ordem = (cfg?.listas?.pavimentos || []).map((p) => p.id);
  const pos = (id) => { const i = ordem.indexOf(id); return i < 0 ? 9999 : i; };
  return [...areasDe(s)].sort((a, b) => pos(a) - pos(b)).map((id) => nomeItem(cfg, 'pavimentos', id)).join(', ');
}
