# Design Spec — Onboarding Wizard (3 steps: account → profile → preferences)

## Visão Geral

Wizard de onboarding user-facing com fluxo tela-a-tela em 3 passos (account → profile
→ preferences), no estilo do onboarding da Stripe: uma casca (shell) persistente com
stepper/progress, e três telas de formulário navegáveis para frente e para trás. O
usuário pode sair e retomar sem perder o que já preencheu.

Este é um fluxo **visual, multi-tela, com comparação de arranjo (wizard flow)** — sinal
visual disparado; um Visual Companion foi oferecido e aceito, e mockups curados foram
destilados por tela.

## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Por quê (preocupação de domínio) | Critério mensurável |
|---|---|---|
| Usability | Onboarding é a primeira experiência; abandono aqui = usuário perdido | Um passo completável em < 3 interações-teclado; erro sempre visível sem scroll |
| Recoverability | Usuário fecha aba no meio e volta; perder dados = re-trabalho e abandono | Progresso parcial de qualquer passo restaurado após reload em < 300ms |
| Accessibility | Formulário público; conformidade e alcance | Navegação por teclado completa; foco previsível a cada transição de passo (WCAG 2.1 AA foco) |

**Consideradas, não priorizadas:** performance de rede (payloads pequenos, não é gargalo),
i18n (copy fixa neste release; estrutura de tokens já suporta expansão futura).

## Especificação Visual

**Artefatos curados** (um por tela aprovada, relativos a este spec):
- `mockups/onboarding-wizard-visual.md` — casca do wizard (stepper, barra de progresso,
  navegação back/next, banner de retomada, estados loading/erro/vazio de nível-casca).
- `mockups/onboarding-account-visual.md` — Passo 1 (account).
- `mockups/onboarding-profile-visual.md` — Passo 2 (profile).
- `mockups/onboarding-preferences-visual.md` — Passo 3 (preferences).

**Fonte de design original:** Nenhuma ferramenta externa; o usuário referenciou "um wizard
como o onboarding da Stripe" como *norte direcional* (referência mental, não arquivo/URL
exportável). Layout definido via mockups do companion. Fidelidade final construída na task
contra o mockup curado.

**Decisões visuais (norte, não pixel-final):**
- Layout: coluna única centralizada, largura máx. `640px`; stepper horizontal no topo
  (desktop) que colapsa para "Passo N de 3" + barra de progresso no mobile (`< 768px`).
- Hierarquia: título do passo é o maior elemento; CTA primário "Continuar" fixo abaixo do
  formulário; "Voltar" secundário à esquerda do primário.
- Spacing/escala: grid de 8px; cards com `--radius-md`.
- Tokens: primária `--brand-500`, erro `--danger-500`, tipografia do design system.

**Fidelidade:** os mockups são *norte*. A fidelidade final é construída nas tasks de UI,
usando as ferramentas de fidelidade visual descobertas no ambiente do plano (não acopladas
a nenhuma ferramenta específica).

## Estrutura de Componentes

- `OnboardingWizard` (casca): roteamento de passos, stepper, progresso, back/next,
  restauração de progresso, gerência de foco entre passos.
- `AccountStep`, `ProfileStep`, `PreferencesStep`: formulários de cada passo.
- `useOnboardingProgress` (store Zustand + persistência): estado de progresso parcial,
  serialização/restauração, passo atual. Lado funcional da recoverability — sem UI.

## Decisões Arquiteturais

As decisões abaixo fecham forks de UI que o fraseado do usuário ("um wizard como o da
Stripe") assumia resolvidos. Cada uma é estrutural (bloqueia build da tela) e é resolvida
aqui com trade-off — nenhuma fica em aberto.

### D1. Timing de validação: on-blur por campo + on-submit do passo (não on-change)

- **Contexto:** O usuário não especificou quando validar. Forks: on-change (a cada tecla),
  on-blur (ao sair do campo), on-submit (ao clicar Continuar). Cada um muda o markup de
  estado de erro por campo e o momento em que o resumo de erro aparece.
- **Decisão:** Validar por campo **on-blur**; revalidar tudo **on-submit** antes de avançar;
  nunca on-change (evita "erro enquanto ainda digito"). Zod como schema por passo.
- **Justificativa técnica:** on-blur dá feedback cedo sem ruído; on-submit é o portão de
  avanço; um schema Zod por passo alimenta ambos.
- **Justificativa de negócio:** reduz frustração no primeiro contato (característica Usability),
  principal alavanca de abandono.
- **Trade-offs aceitos:** um erro corrigido só some no próximo blur/submit, não instantâneo
  (aceito: menos ruído > feedback keystroke-instantâneo).

### D2. Navegação para trás preserva entrada; avançar exige passo válido

- **Contexto:** Wizard permite voltar. Fork: voltar descarta o passo atual? Avançar com
  campos inválidos é bloqueado?
- **Decisão:** "Voltar" **preserva** o que foi digitado no passo atual e nos anteriores (sem
  descarte, sem confirmação). "Continuar" só avança se o passo validar (D1). Voltar nunca é
  bloqueado.
- **Justificativa técnica:** estado vive no store (não no DOM do passo), então navegar não o
  destrói.
- **Justificativa de negócio:** liberdade de revisar sem punição sustenta Usability/Recoverability.
- **Trade-offs aceitos:** dados de um passo à frente que se tornam inválidos ao editar um passo
  anterior só são revalidados quando o usuário reentra naquele passo (não eager cross-step).

### D3. Persistência de progresso parcial: `sessionStorage`, restaurado com banner

- **Contexto:** Recoverability é top-3. Fork: onde persistir (memória volátil / localStorage /
  sessionStorage / backend), e a restauração é silenciosa ou anunciada?
- **Decisão:** Persistir o progresso parcial em **`sessionStorage`** (chave namespaced),
  gravando on-blur/on-step-change; ao reabrir com dados salvos, restaurar no último passo e
  mostrar um **banner "Retomamos de onde você parou"** dismissível. Sem backend neste release.
- **Justificativa técnica:** sessionStorage cobre reload/reabertura de aba na mesma sessão sem
  custo de servidor; banner torna a restauração explícita (não "mágica").
- **Justificativa de negócio:** elimina re-trabalho (alavanca direta de abandono) sem escopo de
  backend.
- **Trade-offs aceitos:** não sobrevive a fechar o browser inteiro nem cross-device (aceito
  para v1; **gatilho de revisão:** migrar para persistência no backend se surgir requisito
  cross-device/long-lived — reversível, isolado no `useOnboardingProgress`).

### D4. Estados de tela: loading / erro / vazio, por nível

- **Contexto:** O usuário só descreveu o happy-path das 3 telas. Forks ocultos: o que a casca
  mostra enquanto hidrata o progresso salvo; o que um passo mostra ao submeter (loading); o que
  aparece se o submit falha (erro); estado "vazio" (primeira visita, nada salvo).
- **Decisão (fechada, por nível):**
  - **Casca:** *loading* = skeleton do stepper + área de passo enquanto restaura sessionStorage;
    *erro* = se a restauração corromper, banner de erro não-bloqueante e começa limpo do passo 1;
    *vazio* = primeira visita cai direto no Passo 1 sem banner de retomada.
  - **Passo:** *loading* = CTA "Continuar" em estado busy/disabled durante submit assíncrono;
    *erro* = resumo de erro no topo do passo + marcação por campo (D1); *vazio* = campos em
    estado default/placeholder.
- **Justificativa de negócio:** estados não-happy são a maior fonte de bugs percebidos em
  onboarding; fechá-los agora evita re-litígio na task.
- **Trade-offs aceitos:** sem retry automático em erro de submit (usuário reclica Continuar).

### D5. Layout responsivo: coluna única, stepper colapsável

- **Contexto:** "user-facing UI" sem menção de mobile. Fork oculto: o stepper horizontal
  não cabe em telas estreitas.
- **Decisão:** Coluna única em todas as larguras; `< 768px` o stepper horizontal colapsa para
  rótulo "Passo N de 3" + barra de progresso; CTAs empilham full-width no mobile.
- **Trade-offs aceitos:** no mobile perde-se a visão de todos os passos de uma vez (aceito:
  progresso textual + barra bastam; reversível via breakpoint).

### D6. Ordem de foco e acessibilidade na transição de passos

- **Contexto:** Accessibility é top-3. Fork oculto: para onde vai o foco quando o passo muda;
  como erros são anunciados.
- **Decisão:** A cada transição de passo, mover foco para o **heading `<h1>` do novo passo**
  (não para o primeiro campo — evita pular o contexto para leitores de tela); tab-order segue
  a ordem visual (campos → Voltar → Continuar); resumo de erro é um `role="alert"` que recebe
  foco no submit inválido. Sem focus-trap (não é modal). Stepper marca o passo atual com
  `aria-current="step"`.
- **Trade-offs aceitos:** foco no heading (não no 1º campo) custa um Tab extra ao usuário de
  teclado (aceito: contexto para AT > 1 keystroke).

**Decisões táticas** (tabela simples):

| Decisão | Justificativa |
|---|---|
| Zod para schema por passo | Já no stack; alimenta on-blur + on-submit |
| Zustand para o store de progresso | Estado cross-componente simples, fora do DOM do passo |

## Riscos

| Risco | Impacto (1-3) | Probabilidade (1-3) | Score | Mitigação |
|---|---|---|---|---|
| Restauração de sessionStorage corrompida quebra a casca | 3 | 1 | 3 🟡 | D4: parse defensivo → fallback limpo do passo 1 + banner de erro; cenário de teste na task da casca |
| Ordem de foco na transição regride sem teste | 2 | 2 | 4 🟡 | D6 vira critério de aceitação + teste a11y na task da casca |

## Testes

- Casca: restaura progresso salvo; foco vai ao heading na troca de passo; back preserva entrada;
  estados loading/erro/vazio de casca.
- Cada passo: validação on-blur + on-submit; resumo de erro focável; layout mobile (coluna única,
  CTAs empilhados).
