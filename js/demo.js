// Dados de exemplo — SÓ no modo demonstração (banco separado, desligado por padrão).
// Baseado no ROV real de referência: 16/06/26, Marisa, Fundos – Monte Fuji, vibração com escavadeira.
import * as db from './db.js';
import { configPadrao } from './config.js';
import { novoROV, salvarROV, salvarVizinho, resumoROV, mapaVizinhos } from './rov.js';
import { uid } from './util.js';

const DESCRICAO = 'No dia 16 de junho de 2026, a Sra. Marisa, proprietária da residência lindeira à obra, entrou em contato com o engenheiro responsável, Jonathan, relatando que sua casa estava apresentando "balanço" perceptível no momento. Na ocasião, a escavadeira encontrava-se em operação nas proximidades do muro divisório, executando serviço de limpeza da área, com remoção de alvenaria e retirada de fragmentos de vigas remanescentes da estrutura anteriormente existente no terreno.';
const ACAO = 'O engenheiro Jonathan prestou esclarecimento imediato à Sra. Marisa, informando que a vibração percebida é consequência esperada da operação de máquina pesada (escavadeira) sobre o terreno, e que tal vibração se propaga de forma transitória às edificações vizinhas durante a execução do serviço. Foi orientado que se tratava de evento de curta duração, associado exclusivamente à etapa de remoção de entulho e de elementos estruturais da construção pré-existente, sem relação com qualquer anormalidade na execução dos trabalhos. A operação ocorria sob supervisão de responsável técnico, com o engenheiro Jonathan e o empreiteiro Vicente presentes no canteiro. Foram anexados registros fotográficos do momento da operação.';

export async function semearDemo() {
  if (!db.modoDemo()) return;
  if (await db.get('config', 'obra')) return;
  const cfg = configPadrao();
  cfg.contratante = 'Construtora (demonstração)';
  cfg.inicio = '2026-06-01';
  cfg.termino = '2028-05-31';
  await db.put('config', cfg);

  const viz = await salvarVizinho({ nome: 'Marisa', endereco: 'Fundos – Monte Fuji', telefone: '' });
  const rov = novoROV('2026-06-16');
  Object.assign(rov, { hora: '', vizinhoId: viz.id, tipo: 'Reclamação', assuntoId: 'ass_1', descricao: DESCRICAO, acao: ACAO });
  await salvarROV(rov);

  // Um RDO fechado de exemplo na mesma data (para testar cópia do efetivo e revisão)
  const numero = await db.proximoSeq('rdo');
  const rdo = {
    id: uid(), numero, rev: 0, revMotivo: '', revDe: null, data: '2026-06-16', status: 'fechado',
    tempo: { manha: 'Sol', tarde: 'Nublado', paralisacao: 'Não', paralisacaoObs: '' },
    efetivo: { fun_1: { presente: 1, faltas: 0, obs: '' }, fun_5: { presente: 1, faltas: 0, obs: '' }, fun_8: { presente: 4, faltas: 1, obs: '1 atestado' }, fun_9: { presente: 6, faltas: 0, obs: '' } },
    subcontratadas: {}, equipamentos: { eqp_7: { qtd: 1 } },
    servicos: [{ id: uid(), areaIds: ['pav_2'], descricao: 'Limpeza do terreno com escavadeira: remoção de alvenaria e de fragmentos de vigas remanescentes da construção pré-existente, junto ao muro divisório dos fundos.', situacao: 'Em andamento', fotos: [] }],
    fiscalizacao: '', ocorrencias: 'Contato da vizinha Marisa (fundos) sobre vibração durante a operação da escavadeira — ver ROV-001.', producao: '', fotos: [],
    copiadoDe: null, fechadoEm: '2026-06-16T18:00:00-03:00',
    rovSnapshot: [resumoROV(rov, cfg, await mapaVizinhos())], cfgSnapshot: structuredClone(cfg),
    criadoEm: '2026-06-16T07:30:00-03:00', atualizadoEm: '2026-06-16T18:00:00-03:00'
  };
  await db.put('rdos', rdo);
}
