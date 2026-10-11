# Roadmap — StudyFocus

## Fase 0 — Auditoria ✅
Stack identificada (React 19 + Vite + Tailwind 4 + Convex + Convex Auth).
Decisão: manter a stack do ambiente (Convex) em vez de Supabase; schema
genérico de exames/taxonomia; motor único de sessões.

## Fase 1 — Fundação + MVP funcional ✅ (esta entrega)
- [x] Tema StudyFocus (dark, técnico, acentos vivos)
- [x] Schema completo: taxonomia, exames, edições, questões, sessões,
      tentativas, favoritos, caderno de erros, stats, vídeos
- [x] Domínios backend: taxonomy, exams, questions, studySessions,
      favorites, errorBook, performance, daily, seed
- [x] Auth (e-mail OTP + visitante) com fluxo `returnTo`
- [x] Landing + onboarding de entrada
- [x] Shell autenticado: Início, Questões, Hoje, Ranking, Perfil
- [x] Dashboard: streak, XP, acertos 30d, erros abertos, sessão ativa,
      ponto de atenção, ranking resumido
- [x] Study Session Engine: custom / daily / exam + fontes errors/favorites
- [x] Question player: treino (correção imediata) e prova (correção no final,
      navegador de questões, marcações, confirmar finalização)
- [x] Resultados com desempenho por matéria
- [x] Caderno de erros real (registra, reabre, resolve)
- [x] Favoritos (salvar no treino, treinar só favoritos)
- [x] Questões do dia determinísticas (seed por usuário+dia)
- [x] Gamificação: XP por dificuldade, streak, ranking semanal
- [x] Seed de demonstração [DEMO] ENEM (24 questões, 8 matérias)
- [x] Typecheck limpo (`tsc -b --noEmit`) e deploy Convex OK

## Fase 2 — Study Session Engine ✅ (esta entrega)
- [x] Tipos de sessão: `single_question`, `custom`, `daily`, `error_review`,
      `favorites`, `review`, `simulation`, `exam` — um único motor, a
      diferença é configuração
- [x] Status completos: `created|in_progress|paused|completed|abandoned`
- [x] Snapshot `studySessionQuestions` (posição estável, status por questão,
      marcação para revisão persistida no servidor)
- [x] Timer real no servidor: nenhum / tempo total / tempo por questão;
      cronômetro sobrevive a reload e finaliza automaticamente ao esgotar
- [x] Pausa real (acumula tempo pausado) e abandono preservando progresso
- [x] Navegação controlada por configuração (com ou sem voltar) via cursor
      server-side (`navigateTo`)
- [x] Garantia de quantidade na criação ("Encontramos apenas N…") e somente
      questões `PUBLISHED` em sessões de aluno
- [x] Player: correção imediata vs. correção no final, navegador ✓/—/🔖 com
      ícones + aria-label (não só cor), resumo antes de finalizar
- [x] Resultado detalhado: por matéria + revisão questão a questão (escolhida
      vs. correta + explicação) e "Treinar meus erros" (sessão `error_review`)
- [x] Histórico de sessões (`/app/history`) com retomada do ponto exato
- [x] Resposta persiste em `questionAttempts` (único histórico, sem duplicar)
- [x] Posse validada no backend em toda leitura/escrita (equivalente RLS)
- [ ] Resultado por tópico e por dificuldade (além de matéria)
- [x] Timer por questão aplicado no player: âncora `currentQuestionStartedAt`
      no servidor (sobrevive a reload), pausa não consome o tempo, expiração
      marca a questão como "deixada para depois" e avança; resposta tardia
      recusada no backend com tolerância de rede (5s)
- [x] Correção antecipada corrigida: regra pura `isFeedbackRevealed` no
      servidor — `review.isCorrect` era exposto cru no payload de
      `getSessionState` (vazava acerto/erro no modo prova); agora filtrado
      por feedbackMode/estado; questões não respondidas nunca são corrigidas
- [x] Importação de provas em PDF (`/app/admin/import-exams`): upload de
      caderno + gabarito no File Storage, extração com `unpdf` (PDFs com
      texto), parser com sinalização honesta de incompletas/duplicatas,
      prévia com contagens, publicação p/ fila de revisão exigindo
      matéria + licença autorizada; PDF digitalizado → needs_ocr (sem
      OCR automático)

## Fase 3 — Banco de questões + importação ✅ (esta entrega)
- [x] Tabela normalizada de alternativas (`questionOptions`) com regra
      "exatamente uma correta" validada em toda escrita
- [x] Fontes com rastreio de licença/permissão (`sources`) e instituições
- [x] Painel admin: listagem com abas por status, filtros (prova, matéria,
      dificuldade, texto), paginação (20/página), revisão, edição, exclusão
- [x] Fluxo editorial draft → review → published com transições validadas;
      publicar revalida a questão (quebrada não publica)
- [x] Importação CSV: upload/colar → análise sem gravar → prévia com contagens
      e erros por linha → confirmação; importadas nascem como `review`
- [x] Auditoria de lotes (`importBatches`) com status e erros por linha
- [x] Camada de serviço no frontend (`src/services/questionsService.ts`)
- [x] 36 testes unitários (parser CSV, validação, CSV de exemplo)
- [x] Seed ampliado: ENEM (24) + FUVEST (6) = 30 questões demo + CSV de exemplo
- [x] Dedupe por `contentHash`: prévia sinaliza duplicatas (banco ou
      repetidas no arquivo) e a confirmação as pula — lote permanece
      `imported`; índice `by_content_hash` para lookup O(log n)
- [ ] Edição em lote e fila de revisão dedicada
- [ ] Criação automática de matérias/áreas ausentes no CSV (hoje: erro claro
      pedindo cadastro prévio)

## Fase 3b — Catálogo
- [ ] Novos exames no catálogo (UNICAMP, UNESP, ETEC, concursos)
- [ ] Tópicos e subtópicos completos por matéria

## Fase 4 — Engajamento
- [ ] Vídeos por questão/tópico (tabela pronta; player e cadastro)
- [ ] Desafio (terceiro bloco do dia, questões difíceis)
- [ ] Revisão espaçada sobre o caderno de erros (substituir heurística simples)
- [ ] Níveis de XP e conquistas não-financeiras

## Fase 5 — Escala e qualidade
- [ ] Paginação real em busca (cursor opaco já implementado; migrar p/
      `paginate` nativo do Convex quando o catálogo crescer)
- [x] Testes automatizados dos fluxos críticos (sessão, correção, permissões) —
      71 testes unitários do motor de sessão e seleção; e2e ainda pendente
- [ ] Monitoramento de erros e performance de queries
- [ ] Acessibilidade: auditoria WCAG completa

## Fora de escopo (v1)
Tutor de IA, recomendações por ML, monetização, apps nativos.
