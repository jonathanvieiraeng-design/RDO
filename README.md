# RDO + ROV: Diário de Obra e Ocorrências com Vizinhos (PWA)

App pessoal e 100% offline para iPhone. Gera o **RDO** diário e registra os **ROVs** (contatos com vizinhos), com PDF no padrão neutro da construtora (Carlito, compatível com Calibri, em tons de cinza).

## Estrutura

```
app/
├── index.html            telas e abas
├── manifest.json         instalação (nome, ícones, cores)
├── service-worker.js     cache offline (mude VERSAO a cada atualização)
├── css/app.css
├── js/
│   ├── app.js            roteador, abas, persistência
│   ├── db.js             IndexedDB (dados + fotos em Blob); demo usa banco separado
│   ├── config.js         dados da obra e listas editáveis
│   ├── rdo.js            regras do RDO (cópia do dia anterior, fechamento, revisões)
│   ├── rov.js            regras do ROV (status, histórico, cancelamento, filtros)
│   ├── pdf.js            PDF do RDO e do ROV (jsPDF)
│   ├── destino.js        destino do relatório (Fase 2: trocar por Microsoft Graph aqui)
│   ├── backup.js         exportar/importar .json (fotos em base64)
│   ├── demo.js           dados de exemplo (só no modo demonstração)
│   ├── ui.js             componentes (contador, botões de seleção, fotos, modais)
│   └── views/            hoje, rdoEditor, historico, vizinhos, ajustes
├── vendor/jspdf.umd.min.js   jsPDF 2.5.1 (MIT), local
├── fonts/Carlito-*.ttf       Carlito (SIL OFL, ver fonts/OFL.txt), local
└── icons/
```

Não há CDN nem chamadas de rede: tudo é servido do próprio site e fica em cache.

## Publicar (HTTPS grátis no GitHub Pages)

O iPhone só instala PWA servido por HTTPS.

1. Crie uma conta em github.com, se ainda não tiver.
2. Crie um repositório novo, por exemplo `rdo`. Pode ser **privado** se o seu plano permitir Pages privado; senão, público. Os dados **não** ficam no site, só no iPhone.
3. Envie **o conteúdo da pasta `app/`** para a raiz do repositório: na página do repositório, use *Add file → Upload files* e arraste tudo o que está dentro de `app/`.
4. Vá em *Settings → Pages → Build and deployment*: Source = *Deploy from a branch*, Branch = `main` / `(root)`. Salve.
5. Em 1 a 2 minutos o endereço fica pronto: `https://SEU-USUARIO.github.io/rdo/`.

Alternativas equivalentes: Netlify Drop (arrastar a pasta em app.netlify.com/drop) ou Cloudflare Pages.

## Instalar no iPhone XR

1. Abra o endereço no **Safari** (não no Chrome).
2. Toque em **Compartilhar → Adicionar à Tela de Início → Adicionar**.
3. Abra pelo ícone **RDO**. Na primeira abertura com internet, o app guarda tudo em cache. Depois disso funciona em modo avião.
4. Vá em **Ajustes**, confira os dados da obra e preencha **Início** e **Término** (sem eles, os dias decorridos e restantes saem como "—").

## Atualizar o app

Altere os arquivos, incremente `VERSAO` em `service-worker.js` (ex.: `rdo-rov-v1.0.1`) e envie de novo ao GitHub. No iPhone, abra o app com internet, feche e abra de novo.

## Testar no computador

Na pasta `APP RDO E ROV`, rode o comando abaixo e abra http://localhost:8080:

```bash
powershell -ExecutionPolicy Bypass -File servir-local.ps1
```

## Uso diário (meta: menos de 5 min)

1. **Hoje → Iniciar RDO.** Efetivo, subcontratadas e equipamentos vêm do último RDO fechado, com faltas zeradas.
2. Tempo: 2 toques. Efetivo: ajuste com −/+. Serviços: área (chip), descrição (o ditado do teclado funciona), situação e fotos. "Repetir serviços de ontem" copia os itens sem as fotos.
3. **Fechar RDO do dia.** Aparece um checklist de campos vazios, só como aviso. Depois o PDF é gerado: toque em **Compartilhar… → OneDrive**.
4. ROV: aba **Vizinhos → + Novo ROV**. O nº ROV-xxx é atribuído na primeira gravação.

## Regras de rastreabilidade implementadas

- Nº do RDO e do ROV são sequenciais e nunca reaproveitados (contador atômico no banco).
- RDO fechado fica imutável. **Criar revisão** exige motivo e cria a Rev. 01, 02… como nova versão. A versão anterior continua intacta e acessível no Histórico.
- No fechamento, o app congela a configuração (nomes de funções, áreas etc.) e os ROVs do dia dentro do RDO. Assim o PDF reproduz exatamente o que foi fechado, mesmo após renomear listas ou importar um backup.
- ROV nunca é excluído: **Cancelar este ROV** exige motivo e entra no histórico. Cada mudança de status grava data, status anterior, novo e nota. "Resolvido" exige data de resolução.
- Itens de lista já usados não podem ser excluídos, apenas ocultados.
- Campos vazios saem como "—" ou a seção é omitida (subcontratadas, equipamentos e fotos vazias). Nada é preenchido com valor padrão.
- `criadoEm`/`atualizadoEm` em ISO 8601 com fuso de São Paulo (`-03:00`).

## Backup

**Ajustes → Exportar backup** gera `backup_RDO-ROV_AAAA-MM-DD.json` com tudo, inclusive as fotos. Salve no OneDrive. O app mostra há quantos dias foi o último backup e alerta depois de 7 dias.
**Importar backup** substitui todos os dados do modo atual (real ou demonstração). Os PDFs não vão no backup: são regenerados a partir dos dados congelados quando você abre o RDO no Histórico.

## Testes manuais (roteiro)

| # | Teste | Resultado esperado |
|---|---|---|
| 1 | Hoje → Iniciar RDO, marcar tempo, +/− no efetivo, 1 serviço com foto | Progresso sobe; "salvo ✓" no topo; totais de presentes e faltas corretos |
| 2 | Fechar app (deslizar), reabrir | Tudo continua preenchido |
| 3 | Fechar RDO do dia | Checklist de vazios; PDF `RDO_MonteFuji_AAAA-MM-DD_n001.pdf`; folha de compartilhamento com OneDrive |
| 4 | Conferir PDF | A4, cabeçalho e rodapé em todas as páginas, "Página X de Y", CREA, foto numerada |
| 5 | Tentar editar o RDO fechado | Campos travados |
| 6 | Histórico → RDO → Criar revisão (motivo vazio, depois preenchido) | Bloqueia sem motivo; abre Rev. 01; ao fechar gera `..._rev01.pdf` com o motivo; Rev. 00 continua no Histórico |
| 7 | Dia seguinte (seta ›) → Iniciar | Efetivo copiado, faltas = 0 |
| 8 | Vizinhos → Novo ROV, cadastrar vizinho na hora, mudar status para Resolvido | Pede data de resolução; histórico com 2 linhas; contador de abertos atualiza |
| 9 | ROV com a data de um RDO aberto | Aparece na seção "Ocorrências de vizinhos" do RDO e no PDF |
| 10 | Filtros De/Até, status, vizinho, assunto → Relatório do filtro | PDF `ROV_MonteFuji_ini_a_fim.pdf` com resumo, fichas, histórico e evidências |
| 11 | Cancelar ROV | Exige motivo; some da lista (aparece com "Incluir cancelados") |
| 12 | Ajustes → Exportar backup → Importar o mesmo arquivo | Contagens iguais; fotos e PDFs voltam |
| 13 | Modo avião → abrir app, criar RDO, foto, fechar, PDF | Tudo funciona sem rede |
| 14 | Ajustes → Ligar demonstração | Faixa amarela; ROV da Marisa (16/06/26) e RDO de exemplo; dados reais intactos ao desligar |

## Premissas [A VALIDAR]

- Pavimentos padrão (Subsolo, Térreo, 1º a 3º Pav, Cobertura, Lazer, Área externa): edite em Ajustes.
- Situação do serviço (Iniciado / Em andamento / Concluído), paralisação por chuva, assuntos de ROV e cancelamento de ROV.
- Dias decorridos contam o dia de início como dia 1; restantes = término − data (negativo = prazo excedido).
- Numeração das fotos no PDF: primeiro as fotos dos serviços, depois as fotos gerais do dia.
- Só existe um RDO por data. Um RDO retroativo recebe o próximo número livre na hora em que é criado.

## Fase 2 (fora do escopo)

Envio automático ao OneDrive via Microsoft Graph: implementar em `js/destino.js` (função `enviarArquivo`), sem alterar o resto do app.
