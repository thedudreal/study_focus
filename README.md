# StudyFocus

Plataforma brasileira de preparação para exames (ENEM, vestibulares, concursos)
baseada em **questões** — treino por assunto, questões do dia, caderno de erros,
favoritos, provas completas e desempenho por matéria.

## Stack

| Camada | Tecnologia |
| --- | --- |
| UI | React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui |
| Backend | Convex (queries/mutations reativas + actions) |
| Auth | Convex Auth (e-mail OTP + visitante anônimo) |
| Roteamento | React Router 7 |
| Ícones/motion | lucide-react + framer-motion |

## Como executar

```bash
bun install
bun dev        # ambiente gerenciado pela plataforma (Vite + Convex)
```

Comandos úteis:

```bash
bun tsc -b --noEmit          # typecheck completo
bun convex dev --once        # codegen + deploy das funções Convex
bun run lint                 # eslint
bun run test                 # testes unitários (vitest)
bun run build                # typecheck + build de produção
```

> A plataforma Freebuff executa o dev server e o `convex dev` em sessões
> gerenciadas; não é necessário (nem recomendado) subi-los manualmente.

## Funcionalidades (v1)

- **Autenticação** — e-mail com código OTP ou visitante anônimo; rotas
  autenticadas em `/app/*` com retorno (`?returnTo=`) preservado.
- **Catálogo de exames** — exames → edições (ano + fase) → questões. O catálogo
  inicial traz o ENEM (conteúdo `[DEMO]` claramente rotulado).
- **Study Session Engine** — um único motor para todos os modos; a diferença
  entre eles é configuração, não código:
  - **Questões rápidas** (`custom`) — aleatórias, com ou sem filtro de matéria;
  - **Estudar assunto** (`custom`) — área → matéria → tópico → subassunto;
  - **Questões do dia** (`daily`) — aquecimento determinístico por seed;
  - **Treinar erros** (`error_review`) — questões do caderno de erros;
  - **Revisar favoritos** (`favorites`);
  - **Simulado** (`simulation`) — aleatório, tempo total, correção só no final,
    marcação para revisão;
  - **Fazer prova** (`exam`) — edição específica, ordem original da prova.
  Configurações comuns: feedback imediato/no final, cronômetro (nenhum/tempo
  total/tempo por questão), ordem original/aleatória (definida na criação e
  estável para sempre), permitir voltar, permitir pausar, quantidade (5–90).
- **Snapshot da sessão** — a sessão grava a relação ordenada
  sessão↔questões (`studySessionQuestions`); navegar, retomar e revisar nunca
  re-executam filtros. Se o filtro devolve menos que o pedido, a criação
  avisa ("Encontramos apenas N…") e oferece começar com o disponível.
- **Question player** — correção imediata (✓/✗ + gabarito + explicação) no
  modo estudo; no modo prova: navegador ✓/—/🔖, marcações persistidas no
  servidor, tempo real que sobrevive a reload, pausa real e confirmação com
  resumo antes de finalizar.
- **Resultado e revisão** — acertos/erros/brancos/marcadas, percentual,
  tempo e desempenho por matéria; revisão questão a questão (escolhida vs.
  correta + explicação) e botão **Treinar meus erros** que cria uma sessão
  `error_review` com as questões erradas.
- **Histórico** — `/app/history` lista todas as sessões (tipo, data, quantidade,
  acertos, aproveitamento, duração, status) com **Continuar** para retomar
  sessões em andamento no ponto exato.
- **Caderno de erros** — registro automático a cada erro; acertar depois marca
  como resolvida; é possível "treinar erros" em sessão dedicada.
- **Favoritos** — salvar/remover durante o treino e treinar apenas favoritos.
- **Desempenho** — histórico vs. últimos 30 dias, com amostra mínima (5
  tentativas) antes de qualquer conclusão sobre fraqueza.
- **Gamificação** — XP por acerto (5/10/15 por dificuldade), streak diário e
  ranking semanal.

## Banco de questões e importação (admin)

O sistema de questões é real: tudo vem do banco (nenhum array mockado), com
fluxo editorial **draft → review → published** e permissões aplicadas no
backend (role `admin`).

### Painel administrativo

Em `/app/admin` (usuários com `role: "admin"`):

- **Questões** — lista com abas por status, filtros (prova, matéria,
  dificuldade, busca textual) e paginação de 20; ações de enviar para revisão,
  publicar, editar e excluir.
- **Revisar/editar** — formulário completo: enunciado, alternativas (marcação
de gabarito), classificação (matéria/assunto), prova/edição, dificuldade,
explicação e imagem.
- **Importar CSV** — envio de arquivo (ou colar), prévia com contagens
(encontradas/válidas/com erros), lista de erros por linha, cancelamento e
confirmação.

### Como importar um CSV

1. Entre em `/app/admin/import`;
2. selecione um arquivo `.csv` (ex.: `data/exemplo-questoes-demo.csv`) ou cole
   o conteúdo;
3. clique em **Analisar arquivo** — o sistema valida sem gravar;
4. corrija as linhas com erro (mostradas com o motivo) ou prossiga;
5. clique em **Importar N questões como review**.

Formato das colunas (cabeçalho obrigatório):

```
exam,year,phase,area,subject,topic,subtopic,difficulty,type,statement,option_a,option_b,option_c,option_d,option_e,correct_answer,explanation,source
```

Regras validadas: enunciado obrigatório; mínimo 2 alternativas não vazias;
**exatamente uma** resposta correta (A–E) com alternativa correspondente;
matéria e prova obrigatórias; ano entre 1900–2100. Questões importadas entram
**como `review`** — nada é publicado automaticamente. Dificuldade aceita
Fácil/Facil/easy, Média/medium, Difícil/hard. Campos com vírgula entre aspas.

### Como cadastrar uma questão manualmente

`/app/admin` → **Nova questão** → preencha enunciado, alternativas (clique na
letra para marcar a correta), matéria, prova/edição e dificuldade →
**Criar questão** (vira `draft`) → **Enviar para revisão** → revise →
**Publicar**.

### Conteúdo de demonstração

O seed (`src/convex/seed.ts`) cria **[DEMO] ENEM** (24 questões) e **[DEMO]
FUVEST** (6 questões), 30 no total em 8 matérias, todas rotuladas `[DEMO]`.
Acionável pelo botão "Carregar catálogo de demonstração" na página Questões.
Adicionalmente, `data/exemplo-questoes-demo.csv` traz 10 questões para testar
a importação. Nenhum conteúdo real é incluído sem fonte registrada — ver
`ARCHITECTURE.md`.

## Estrutura de pastas

```
src/
  components/       # AppShell, DemoSeedButton, ui/ (shadcn)
  convex/           # backend: schema + domínios
    lib/            # sessionCore (puro), sessionBuilder (seleção),
                    # sessionTransactions (persistência), stats, validações
    schema.ts       # modelo de dados completo
  pages/            # rotas (Landing, Auth, Dashboard, Questions, …)
  hooks/            # use-auth, use-mobile
```

Documentação adicional: [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`DATABASE.md`](./DATABASE.md), [`ROADMAP.md`](./ROADMAP.md).
