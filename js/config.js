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

// Listas do RDO-MODELO.xls. Pavimentos e assuntos são premissas [A VALIDAR], editáveis em Ajustes.
const PADRAO = {
  pavimentos: ['Subsolo', 'Térreo', '1º Pav', '2º Pav', '3º Pav', 'Cobertura', 'Lazer', 'Área externa'],
  funcoes: ['Engenheiro', 'Estagiário', 'Téc. Edificações', 'Tec. de Segurança', 'Encarregado/Mestre', 'Almoxarife',
    'Auxiliar Administrativo', 'Pedreiro', 'Ajudante', 'Carpinteiro', 'Armador', 'Eletricista', 'Aj. Elétrica',
    'Encanador', 'Azulejista', 'Pintor', 'Impermeabilizador', 'Fachadeiro', 'Gesseiro', 'Guincheiro'],
  subcontratadas: ['Elevadores', 'Instalação de gás', 'Instalação de combate a incêndio'],
  equipamentos: ['Serra de bancada', 'Vibradores', 'Mangotes do vibrador', 'Serra elétrica', 'Serra mármore', 'Guincho',
    'Betoneira/Masseira/Silo', 'Balancins'],
  assuntos: ['Vibração', 'Ruído', 'Poeira', 'Sujeira na via', 'Dano em imóvel', 'Horário', 'Outros']
};
const PREFIXO = { pavimentos: 'pav', funcoes: 'fun', subcontratadas: 'sub', equipamentos: 'eqp', assuntos: 'ass' };

export function listasPadrao() {
  const o = {};
  for (const [k, nomes] of Object.entries(PADRAO)) o[k] = nomes.map((n, i) => ({ id: `${PREFIXO[k]}_${i + 1}`, nome: n, oculto: false }));
  return o;
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
