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

### Questões
- `questions` — `statement`, `context` (enunciado-base compartilhado),
  `alternatives[] {letter, text}`, `correctLetter`, `explanation`,
  classificação (`subjectId`, `topicId`, `subtopicId`), origem (`examId`,
  `editionId`, `sourceRef`, `sourceOrder` — preserva a ordem na prova),
  `difficulty`, `status` (`draft|review|published|archived`), `contentHash`
  (reservado para deduplicação), `videoId`.
  Índices: `by_status`, `by_exam`, `by_edition (editionId, sourceOrder)`,
  `by_subject`, `searchIndex search_statement`.

### Study Sessions
- `studySessions` — `userId`, `type` (`custom|daily|exam`), `feedbackMode`
  (`immediate|end`), filtros usados (`examId`, `editionId`, `subjectId`),
  `questionCount`, `questionIds[]` (ordem de resposta), `source`
  (`errors|favorites`), `dailyKind`, `timerSeconds`, `status`
  (`active|completed|abandoned`), `currentIndex`, `answers[]`
  (`questionId`, `selectedLetter`, `isCorrect`, `timeSpentSeconds`, `flagged`),
  `startedAt`, `completedAt`.
  Índice: `by_user_status`.
  **Conceito central**: prova, simulado, treino, questões do dia, erros e
  favoritos são registros nesta tabela, não sistemas à parte.

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
- `persistAttempt` (studySessions) é o único caminho que grava
  `questionAttempts` + `errorBook` + `dailyAnswers` + `userStats`, garantindo
  consistência entre os agregados.
- Modo prova persiste tentativas em bloco no `finishSession`.

## Migrações

Convex aplica o schema automaticamente (push versionado por deploy). Mudanças
de schema são feitas em `schema.ts` e versionadas pelo git; para ambiente
reproduzível, rodar o seed demo (`api.seed.runDemoSeed`) após o primeiro deploy.

## Conteúdo de demonstração

O seed cria `[DEMO] ENEM` (edição 2024 · 1º dia) com 24 questões rotuladas em
8 matérias. Idempotente via checagem de slug. Conteúdo real exige o pipeline de
importação com revisão humana (ver `ARCHITECTURE.md`).
