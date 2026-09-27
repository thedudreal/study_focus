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

## Fase 2 — Simulados avançados
- [ ] Timer por questão e tempo total configurável (campo já existe na sessão)
- [ ] Navegação livre entre questões no modo prova (pular/voltar)
- [ ] Retomada de prova com estado exato (marcações persistidas no servidor)
- [ ] Resultado por tópico e por dificuldade (além de matéria)

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
- [ ] Detecção de duplicatas via `contentHash` (hash já gravado; comparação pendente)
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
- [ ] Testes automatizados dos fluxos críticos (sessão, correção, permissões)
- [ ] Monitoramento de erros e performance de queries
- [ ] Acessibilidade: auditoria WCAG completa

## Fora de escopo (v1)
Tutor de IA, recomendações por ML, monetização, apps nativos.
