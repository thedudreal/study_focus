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

## Fase 3 — Conteúdo e catálogo
- [ ] Painel admin (mutations prontas; falta UI e rota protegida por role)
- [ ] Pipeline de importação com estados draft → review → published
- [ ] Detecção de duplicatas via `contentHash` (e similaridade depois)
- [ ] Novos exames no catálogo (FUVEST, UNICAMP, UNESP, ETEC, concursos)
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
