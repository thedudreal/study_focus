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
```

> A plataforma Freebuff executa o dev server e o `convex dev` em sessões
> gerenciadas; não é necessário (nem recomendado) subi-los manualmente.

## Funcionalidades (v1)

- **Autenticação** — e-mail com código OTP ou visitante anônimo; rotas
  autenticadas em `/app/*` com retorno (`?returnTo=`) preservado.
- **Catálogo de exames** — exames → edições (ano + fase) → questões. O catálogo
  inicial traz o ENEM (conteúdo `[DEMO]` claramente rotulado).
- **Study Session** — um único motor para todos os modos:
  - `custom` (treino rápido ou por matéria, com feedback imediato);
  - `daily` (aquecimento determinístico por seed: erros recentes + novas fáceis);
  - `exam` (prova da edição, ordem original, correção só no final);
  - fontes especiais: `errors` (caderno de erros) e `favorites`.
- **Question player** — correção imediata com gabarito; no modo prova:
  navegador de questões, marcações, tempo e confirmação antes de finalizar.
- **Resultados** — acertos/erros/brancos, percentual, tempo e desempenho por
  matéria.
- **Caderno de erros** — registro automático a cada erro; acertar depois marca
  como resolvida; é possível "treinar erros" em sessão dedicada.
- **Favoritos** — salvar/remover durante o treino e treinar apenas favoritos.
- **Desempenho** — histórico vs. últimos 30 dias, com amostra mínima (5
  tentativas) antes de qualquer conclusão sobre fraqueza.
- **Gamificação** — XP por acerto (5/10/15 por dificuldade), streak diário e
  ranking semanal.

## Conteúdo de demonstração

O seed (`src/convex/seed.ts`) cria o exame **[DEMO] ENEM** com 24 questões
ilustrativas de 8 matérias, todas rotuladas com `[DEMO]` no enunciado. Ele é
acionável pelo botão "Carregar catálogo de demonstração" na página Questões
(ou via `api.seed.runDemoSeed`). É idempotente: nada é duplicado.

Nenhum conteúdo real de prova é incluído sem rastreio de fonte e permissão —
ver `ARCHITECTURE.md` (pipeline de importação) e `ROADMAP.md`.

## Estrutura de pastas

```
src/
  components/       # AppShell, DemoSeedButton, ui/ (shadcn)
  convex/           # backend: schema + domínios
    lib/            # sessionBuilder (motor de sessões), stats (XP/streak)
    schema.ts       # modelo de dados completo
  pages/            # rotas (Landing, Auth, Dashboard, Questions, …)
  hooks/            # use-auth, use-mobile
```

Documentação adicional: [`ARCHITECTURE.md`](./ARCHITECTURE.md),
[`DATABASE.md`](./DATABASE.md), [`ROADMAP.md`](./ROADMAP.md).
