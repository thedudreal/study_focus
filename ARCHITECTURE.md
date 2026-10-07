# Arquitetura — StudyFocus

## Visão em camadas

```
UI (pages/, components/)
        ↓
Features (fluxos: criar sessão, player, resultados…)
        ↓
Business Logic (convex/lib: sessionBuilder, stats)
        ↓
Services (funções Convex por domínio)
        ↓
Database (Convex tables — schema.ts)
```

Regras de negócio (seleção de questões, XP, streak, agregação de resultado)
vivem no backend, nunca nos componentes. As telas apenas consomem queries
reativas e chamam mutations.

## Decisões técnicas

### 1. Convex em vez de Supabase/Postgres
O prompt sugeria Supabase + RLS, mas o ambiente já entrega Convex + Convex Auth
integrados ao build e ao deploy. Autenticação e autorização são garantidas no
**backend** (toda função valida `getAuthUserId` e propriedade do recurso), que
é o mesmo princípio do RLS — sem confiar nunca no frontend. Migração futura
para Postgres é viável: o schema está documentado em `DATABASE.md`.

### 2. Um só motor de Study Session
Simulado, prova, questões do dia, treino de erros, favoritos e treino por
assunto **não** são sistemas separados — todos são registros em `studySessions`
com configurações diferentes. O motor tem três camadas:

- **`lib/sessionCore.ts` (puro, testável)** — tipos de sessão, status,
  política padrão por tipo (`SessionPolicy`: feedback, timer, ordem,
  navegação, pausa), cálculo de resultado (`buildResultCounts`) e helpers de
  tempo. Sem dependência do Convex.
- **`lib/sessionBuilder.ts` (seleção)** — escolhe as questões: somente
  `PUBLISHED` e válidas, com garantia de quantidade (devolve o que existe —
  a UI avisa "Encontramos apenas N…"), ordem definida **na criação** via seed
  PRNG (`RANDOM`) ou ordem original da prova (`ORIGINAL`), sem duplicatas.
  A prévia (`previewSelection`) usa a mesma função — nunca sorteia na UI.
- **`studySessions.ts` (API do motor)** — criação com snapshot
  (`studySessionQuestions` com `position` estável), resposta
  (`answerQuestion` — persistência imediata no modo estudo, em bloco no
  `finishSession` no modo prova), navegação server-side (`navigateTo`
  respeitando `allowBackNavigation`), marcação para revisão, pausa real
  (`pausedAccumSeconds`/`lastPausedAt` — o relógio é derivado do servidor,
  sobrevive a reload), abandono preservando progresso, finalização com
  resumo, resultado detalhado por questão, histórico e retomada
  (`listHistory`, `getActiveSession`), e "treinar erros"
  (`retryErrorsSession` cria sessão `error_review`).

A diferença entre os modos está em *como* as questões são escolhidas e
*quando* o gabarito é revelado (`immediate` vs. `end`) — nunca em telas
novas. **Adicionar um novo tipo de sessão** = 1) incluir o valor no union do
schema e em `SESSION_TYPE_LABEL`/política em `sessionCore.ts`; 2) um seletor
de questões em `sessionBuilder.ts` (ou reuso dos existentes); 3) uma entrada
no formulário de criação (`CreateSession.tsx`) quando fizer sentido. Player,
resultado, histórico e timer já valem para o novo tipo.

### 3. Determinismo nas questões do dia
`dailySeed(userId, date)` gera PRNG estável: as mesmas questões aparecem para o
mesmo usuário durante o dia. Regra simples e auditável — Aquecimento prioriza
erros recentes não resolvidos e completa com novas fáceis. Nada de ML prematuro.

### 4. Tentativas persistidas em dois pontos
No modo treino (`immediate`) cada resposta grava `questionAttempts`,
atualiza caderno de erros, stats e XP na hora. No modo prova (`end`) as
respostas ficam no array da sessão e são persistidas em bloco no
`finishSession` — espelha o exame real e evita writes desnecessários.

### 5. Honestidade estatística
Conclusões sobre fraqueza exigem amostra mínima (`MIN_SAMPLE = 5`) por matéria.
O histórico é separado do recorte de 30 dias. Sem dados suficientes a UI mostra
"—" e explica o porquê, nunca inventa porcentagem.

### 6. Conteúdo demo rotulado + pipeline de importação
Todo o catálogo inicial vem do seed `[DEMO]`. A importação de conteúdo segue
pipeline explícito: **fonte → permissão → CSV → validação → prévia → revisão
humana → publicação**. Estados `draft/review/published/archived` no schema;
`sources` rastreia licença/verificação; `importBatches` audita cada lote.
**Nada é publicado automaticamente** — questões importadas nascem em `review`
e só viram `published` por decisão de admin, com revalidação na transição.

### 7. Camadas de acesso a questões
```
UI (pages)  →  services/questionsService.ts  →  convex/questions | adminQuestions | importCsv  →  banco
```
Componentes nunca chamam `api.questions.*` diretamente: passam pelo service,
que centraliza filtros, paginação e tipos. A validação de questões
(`convex/lib/questionValidation.ts`) é código puro compartilhado entre backend
e testes — a mesma regra protege criação manual, edição, importação e a
transição de publicação.

### 8. Escala
Paginação por cursor em todas as listagens (nunca carregar milhares de
questões); índices por status, prova, edição, matéria e lote; busca textual via
searchIndex do Convex. As alternativas vivem em tabela normalizada
(`questionOptions`) para validação relacional sem escanear enunciados.

## Segurança

- Autenticação via Convex Auth (e-mail OTP + anônimo); sessões federadas
  Freebuff suportadas pelo provedor configurado em `auth.config.ts`.
- **Autorização no servidor**: toda query/mutation de dado do usuário valida
  `userId`; mutações administrativas (`questions.createQuestion` etc.) exigem
  `role === "admin"`.
- Nenhum segredo no cliente: integrações ficam em Convex actions (`"use node"`),
  lendo `process.env`.
- Rotas protegidas por `RequireAuth` com `returnTo` preservado.

## Frontend

- **Dark-first, técnico**: tokens em `src/index.css` (fundo `#0a0c10`, acentos
  violeta/ciano/lima, mono para métricas).
- Rotas `/app/*` dentro de `AppShell` com navegação: Início, Questões, Hoje,
  Ranking, Perfil (mobile: barra horizontal rolável).
- Estados de carregamento, vazio e erro em toda tela que depende de dados;
  erros de mutation vão para toasts (`sonner`).
- Code splitting por rota via `lazy()`.

## Extensões futuras (previstas, não implementadas)

- Vídeos: tabela pronta (`videos`), link por questão (`questions.videoId`).
- Admin: mutations prontas, painel pendente (ver `ROADMAP.md`).
- Duplicatas: `contentHash` reservado na tabela de questões.
