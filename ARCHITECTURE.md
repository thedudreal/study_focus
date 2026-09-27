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
Simulado, prova, questões do dia, treino de erros e favoritos **não** são
sistemas separados. `studySessions` guarda tipo, modo de feedback e o array
ordenado de questões; a diferença está em *como* as questões são escolhidas
(`lib/sessionBuilder.ts`) e *quando* o gabarito é revelado (`immediate` vs.
`end`). Novos modos (revisão espaçada, desafio) são novos seletores, não novas
telas.

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

### 6. Conteúdo demo rotulado
Todo o catálogo inicial vem do seed `[DEMO]`. A importação de conteúdo real é
um pipeline futuro (fonte → permissão → extração → estruturação → classificação
→ validação → revisão humana → publicação), com estados `draft/review/published`
já presentes no schema. Nunca publicamos automaticamente conteúdo não validado.

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
