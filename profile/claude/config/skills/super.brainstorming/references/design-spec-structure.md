# Design Spec Structure — enriched sections

Read when writing the design doc (checklist step 6). Defines three sections that capture what brainstorming produced but plain prose loses: prioritized characteristics, decision rationale with trade-offs, and risks. Frameworks from *Fundamentals of Software Architecture* (Richards & Ford, 2nd ed.), ch. 4-5 and 21-22.

These complement — not replace — sections the spec already covers (visão geral, arquitetura/fluxo, estrutura de componentes, endpoints, testes). Scale to complexity: a small feature may need three lines per section; skip a section only when its content is genuinely empty (e.g., a pure refactor with no new risks). One section — **Especificação Visual** — is conditional: include only when a mockup or external design informed the feature.

## Section: Características Arquiteturais

Output of the elicitation in `architecture-characteristics.md`. Place right after "Visão Geral" — it justifies every structural decision that follows.

```markdown
## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Performance | Lista usada centenas de vezes/dia pelos admins | Busca < 500ms com 10k usuários |
| Availability | Check-in é a operação central do negócio | Falha de notificação não bloqueia o check-in |

**Consideradas, não priorizadas:** scalability (volume atual não justifica), i18n (sem expansão prevista).
```

Every prioritized characteristic needs a measurable criterion — it becomes a test during implementation. A characteristic nobody can verify is an opinion, not a requirement.

## Section: Especificação Visual

**Optional — include only when a visual companion mockup, screenshot, or external design tool informed the feature.** Skip entirely for non-visual work (backend, data, config). Place near "Estrutura de Componentes" — it grounds component structure in the screen.

Durable record of visual decisions. Companion mockups are throwaway; this prose keeps the *design source* and *decisions already made* in the spec, so `super.writing-plans` carries them into UI tasks instead of re-deriving (and re-litigating) layout.

```markdown
## Especificação Visual

**Artefato curado:** `mockups/checkout-visual.md` (prosa + core HTML/JSX, relativo a este spec)

**Fonte de design original:** <URL da ferramenta de design / arquivo exportado / screenshot>
_— ou_ "Nenhuma; layout definido apenas via mockup do companion."

**Decisões visuais (norte, não pixel-final):**
- Layout: duas colunas — resumo fixo à direita, formulário à esquerda.
- Hierarquia: total do pedido é o maior elemento; CTA primário abaixo do resumo.
- Spacing/escala: grid de 8px; cards com radius do tema (`--radius-md`).
- Tokens: cor primária `--brand-500`, tipografia do design system.

**Fidelidade:** o mockup é um *norte*. A fidelidade final é construída na task de implementação, de preferência contra a fonte de design original se existir, usando ferramentas de fidelidade visual do ambiente (descobertas no plano — não acopladas a nenhuma ferramenta específica).
```

Two anchors prevent rework. **Fonte de design original** records whether a higher-fidelity source exists (design-tool URL, export, screenshot) so implementation can reach for it — tool-agnostic: name what this project used or state none exists; superpowers never assumes a specific tool. **Decisões visuais** captures layout, hierarchy, spacing, and applied tokens as prose, so visual choices don't die with the throwaway mockup before the plan is written. The heavier core (detailed prose + HTML/JSX) lives in the curated artifact under `mockups/`; this section stays concise and links to it.

## Section: Decisões Arquiteturais

Replaces the plain `Decisão | Justificativa` table. Each architecturally significant decision (triage in `tradeoff-analysis.md`) gets a compact ADR-style block; tactical decisions stay in a simple table.

```markdown
## Decisões Arquiteturais

### D1. SSE em vez de WebSocket para entrega de notificações

- **Contexto:** Frontend precisa de notificações em tempo real. Alternativas: SSE, WebSocket, polling.
- **Decisão:** SSE via `reply.hijack()` nativo do Fastify.
- **Justificativa técnica:** Comunicação unidirecional basta; HTTP-nativo; zero dependência adicional.
- **Justificativa de negócio:** Menor custo de implementação/operação; sem requisito bidirecional que justifique WebSocket.
- **Trade-offs aceitos:** Sem canal cliente→servidor (exigiria novo endpoint REST); limite de conexões por domínio no HTTP/1.1.
```

Two fields prevent rework. **Justificativa de negócio** stops endless relitigation ("Groundhog Day") — cost, time to market, user satisfaction, or strategic positioning; if none applies, question whether the decision should exist. **Trade-offs aceitos** records what the decision *gives up*, so a maintainer who doesn't know SSE was chosen *for simplicity over bidirectionality* won't "fix" it back into the problem it avoided.

Decisions here are session-scoped. When one deserves organization-wide registration, suggest the `to-adr` skill after the feature work — don't duplicate full ADRs in the spec.

## Section: Riscos

Risk analysis scoped to the feature. Place before "Testes" — high risks should generate test scenarios or mitigation tasks.

```markdown
## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Time não domina RabbitMQ DLQ | 3 | 3 | 9 🔴 | Spike de 1 dia antes da task; par com dev sênior |
| Índice parcial não suportado pelo Prisma | 2 | 1 | 2 🟢 | Migration SQL raw documentada |
```

Rules for scoring:

- **Score = impacto × probabilidade.** 1-2 low (🟢), 3-4 medium (🟡), 6-9 high (🔴).
- **Assess impact first**, probability second. When unsure about probability, assume 3 (high) until verified.
- **Unknown/unproven technology is automatically 9** — the team not knowing it is itself the risk, regardless of how good the tech is. Mitigation: spike, training, or substitution.
- Derive risk dimensions from the prioritized characteristics — if availability is top-3, ask "o que pode derrubar isso?" for each component supporting it.
- Every 🔴 risk needs a mitigation that appears in the plan (task, spike, test scenario) — a high risk with no planned response is a decision to accept it, which the user must make explicitly.

## Self-review additions

When running the spec self-review (checklist step 7), also verify:

1. Every prioritized characteristic has a measurable criterion.
2. Every architecturally significant decision records its trade-offs (a decision listing only benefits is incomplete).
3. Every 🔴 risk has a mitigation or an explicit user acceptance.
4. No component name ends in Manager/Handler/Processor/Service without having passed the responsibility test (see `logical-components.md`).
5. If a visual companion or external design informed the feature, the spec has an Especificação Visual section recording the design source and visual decisions (not an architecture-only description), and the curated artifact under `specs/mockups/` exists and is linked.
