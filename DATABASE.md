# Banco de dados — StudyFocus

Backend: Convex (document store transacional com índices declarados no schema).
Arquivo único de verdade: `src/convex/schema.ts`.

## Entidades

### Auth (template, preservado)
- `users` — nome, e-mail, imagem, `role` (`admin` | `user` | `member`).
  Índice: `email`.

### Taxonomia
- `taxonomyNodes` — árvore genérica: `area → subject → topic → subtopic`.
  Campos: `level`, `name`, `slug`, `parentId`, `order`.
  Índice: `by_parent (level, parentId)`.
  Novas matérias entram por dado, não por código.

### Exames
- `exams` — instituição, nome, slug, tipo (`vestibular|enem|concurso|certification`),
  status (`draft|active|archived`). Índices: `by_slug`, `by_status`.
- `examEditions` — edição concreta: `examId`, `year`, `phase` (ex. "1º dia"),
  `questionCount`. Índice: `by_exam_year`.
  FUVEST 2025 1ª fase ≠ FUVEST 2025 2ª fase — cada uma é uma edição.

### Instituições e fontes
- `institutions` — mantenedor das provas (USP, INEP, UNICAMP…): `name`,
  `slug`, `description`. Índice: `by_slug`.
- `sources` — rastreio de licença/uso do conteúdo: `name`, `organization`,
  `url`, `licenseOrPermission`, `verificationStatus`
  (`unverified|pending|verified|rejected`), `verifiedAt`, `notes`.
  Índice: `by_verification`. Toda questão importada referencia uma fonte
  quando aplicável; fontes de CSV entram como `unverified` e exigem validação
  humana antes de virar conteúdo distribuído.

### Questões
- `questions` — `statement`, `context` (enunciado-base compartilhado),
  `alternatives[] {letter, text}` (leitura rápida) + tabela normalizada
  `questionOptions` (autoritativa), `correctLetter`, `explanation`,
  classificação (`subjectId`, `topicId`, `subtopicId`), origem (`examId`,
  `editionId`, `sourceRef`, `sourceOrder` — preserva a ordem na prova),
  `difficulty`, `questionType` (`multiple_choice`), `sourceId` (ID externo),
  `sourceDbId` (→ `sources`), `imageUrl`, `status`
  (`draft|review|published|archived`), `importBatchId` (→ `importBatches`),
  `contentHash` (dedupe), `videoId`.
  Índices: `by_status`, `by_exam`, `by_edition (editionId, sourceOrder)`,
  `by_subject`, `by_batch`, `by_source_id`, `searchIndex search_statement`.

### Alternativas (normalizadas)
- `questionOptions` — `questionId`, `label` ("A".."E"), `text`, `isCorrect`,
  `order`. Índice: `by_question_order`. Regra: **exatamente uma** alternativa
  com `isCorrect: true` — validada em `lib/questionValidation.ts` em toda
  criação, edição e antes de qualquer publicação.

### Importação
- `importBatches` — auditoria de cada CSV importado: `filename`, `totalRows`,
  `validRows`, `errorRows`, `importedCount`, `status`
  (`validating|ready|importing|imported|failed|cancelled`), `errors[]`
  (por linha), `createdAt`, `createdBy`. Índice: `by_status`.
  **Toda questão importada nasce como `review` — nunca publicada
  automaticamente.**

### Study Sessions
- `studySessions` — a sessão em si (config + progresso):
  - identidade: `userId`, `type`
    (`single_question|custom|daily|error_review|favorites|review|simulation|exam`),
    `title`, `status` (`created|in_progress|paused|completed|abandoned`);
  - configuração: `feedbackMode` (`immediate|end`), `timerMode`
    (`none|total|per_question`), `totalTimeSeconds`, `perQuestionSeconds`,
    `orderMode` (`original|random`), `allowBackNavigation`, `allowPause`,
    `seed` (ordem aleatória estável), filtros (`examId`, `editionId`,
    `subjectId`, `topicId`, `subtopicId`, `difficulty`, `questionCount`,
    `source`, `dailyKind`);
  - progresso: `questionCount`, `answeredCount`, `correctCount`,
    `incorrectCount` (desnormalizados), `currentIndex` (cursor server-side),
    `timerSeconds`, `pausedAccumSeconds`, `lastPausedAt`, `startedAt`,
    `completedAt`.
  Índices: `by_user_status`, `by_user_created`.
  **Conceito central**: prova, simulado, treino, questões do dia, erros e
  favoritos são registros nesta tabela, não sistemas à parte.

### Snapshot da sessão
- `studySessionQuestions` — relação ordenada sessão↔questões. Campos:
  `sessionId`, `questionId`, `position`, `status`
  (`pending|answered|skipped`), `selectedLetter`, `isCorrect`,
  `timeSpentSeconds`, `markedForReview`, `answeredAt`.
  Índice: `by_session_position (sessionId, position)`.
  A ordem é definida na criação e **nunca muda**; navegação, marcação,
  retomada e revisão leem o snapshot — nunca re-executam filtros. Deletar a
  questão publicada não quebra a sessão concluída (o histórico sobrevive).

### Registro de estudo
- `questionAttempts` — uma linha por resposta persistida: `userId`,
  `questionId`, `sessionId`, `selectedLetter`, `isCorrect`, `timeSpentSeconds`,
  desnormalização de classificação (`subjectId`, `topicId`, `difficulty`) para
  agregações baratas, `answeredAt`.
  Índices: `by_user_time`, `by_user_question`, `by_session`.
- `favorites` — `userId`, `questionId`, `createdAt`.
  Índices: `by_user`, `by_user_question` (unique via consulta `.unique()`).
- `errorBook` — `userId`, `questionId`, `errorCount`, `lastErrorAt`,
  `resolved`. Acertar depois marca `resolved: true`; errar de novo reabre e
  incrementa. Índices: `by_user_active`, `by_user_question`.

### Desempenho e gamificação
- `dailyAnswers` — agregado por dia: `userId`, `date` ("YYYY-MM-DD"),
  `answered`, `correct`. Índice: `by_user_date`.
- `userStats` — acumulados: `totalAttempts`, `totalCorrect`, `xp`,
  `currentStreak`, `bestStreak`, `lastStudyDate`, `updatedAt`.
  Índices: `by_user`, `by_xp` (ranking).

### Vídeos (preparado para fases futuras)
- `videos` — `title`, `url`, `platform` (`youtube|vimeo|other`), `description`,
  `durationSeconds`. Referenciado por `questions.videoId`. Somente links para
  fontes originais.

## Regras de escrita

- Toda mutation valida o usuário autenticado e a posse do recurso.
- Operações de conteúdo (criar/editar/publicar/excluir questões, importar CSV)
  exigem `role === "admin"` — o frontend nunca decide permissão, apenas o
  backend (`requireAdmin` em `adminQuestions.ts` e `importCsv.ts`).
- `writeQuestionWithOptions` é o único caminho que grava questão + sincroniza
  as alternativas em `questionOptions` (delete + reinsert atômico na mutation).
- `persistAttempt` (lib/sessionTransactions) é o único caminho que grava
  `questionAttempts` + `errorBook` + `dailyAnswers` + `userStats`, garantindo
  consistência entre os agregados.
- Modo prova persiste tentativas em bloco no `finishSession`.
- **Gabarito nunca vaza**: `getSessionState` só envia `correctLetter`/
  `explanation` no modo estudo, e `isCorrect` só de questões já respondidas;
  no modo prova o resultado só é calculado após finalizar.
- **Timer real**: `elapsedSeconds` é derivado no servidor de
  `startedAt − pausedAccumSeconds` (usando `lastPausedAt` quando pausado).
  Pausa acumula o tempo pausado no `resumeSession`; reload não reseta o
  cronômetro.
- **Cursor server-side**: `navigateTo` move `currentIndex` respeitando
  `allowBackNavigation`; sem volta, só a corrente ou a próxima são alcançáveis.
  Responder não move o cursor — a correção imediata permanece visível.
- Transições de status seguem o fluxo editorial: `draft → review → published`
  (com volta para draft e arquivamento em qualquer ponto). Publicar revalida a
  questão — questão quebrada não publica.

## Migrações

Convex aplica o schema automaticamente (push versionado por deploy — o
equivalente a migrations aqui é `schema.ts` versionado no git). Para ambiente
reproduzível: primeiro deploy → rodar o seed demo (`api.seed.runDemoSeed`) →
importar conteúdo via CSV pelo painel admin.

## Conteúdo de demonstração

O seed cria dois exames idempotentes: **[DEMO] ENEM** (edição 2024 · 1º dia,
24 questões) e **[DEMO] FUVEST** (USP · FUVEST, edição 2025 · 1ª fase, 6
questões) — 30 questões em 8 matérias, todas rotuladas `[DEMO]` no enunciado.
Há ainda `data/exemplo-questoes-demo.csv` com 10 questões (ENEM 2025 + FUVEST
2025) prontas para testar o fluxo de importação. Conteúdo real exige fonte
registrada e verificada (tabela `sources`) — ver `ARCHITECTURE.md`.
