---
name: code-style
description: "Use whenever writing, generating, refactoring, or reviewing React, TypeScript, or JavaScript code — even if the user does not explicitly mention style, architecture, or conventions. ALWAYS activate when: creating React components (views, controllers, use cases), writing TypeScript entities or value objects, implementing hooks or gateways, writing tests or fixtures, or refactoring any JS/TS code in this project. Coding standards, naming conventions and architectural patterns for the Framework Brasil codebase."
---

# Coding Standards — Framework Brasil

Padrões de codificação extraídos diretamente dos módulos `subscription`, `consumption-details`, `digital-services` e `shared`. Aplique-os em **todo código React, TypeScript ou JavaScript** deste projeto.

Consulte o arquivo de referência adequado ao contexto antes de gerar código.

---

## Princípios Fundamentais

Quatro princípios se reforçam mutuamente em todo o código:

- **DDD** — modele a intenção do negócio, não o artefato técnico. Nomes refletem o vocabulário do domínio.
- **DbC** — use `requires()`, `ensures()` e `invariant()` para proteger invariantes em runtime.
- **CQS** — métodos ou retornam dados (query) ou causam efeito colateral (command), nunca os dois.
- **ETC** — escreva código para ser substituído. Sem amarrações desnecessárias entre camadas.

---

## Anti-padrões Críticos

Evite estes antes de escrever qualquer código:

| Anti-padrão | Correto |
|---|---|
| `interface ISubscriptionGateway` | `interface SubscriptionGateway` |
| `getName(): string` | `get name(): string` |
| `setSearchQuery(q: string)` | `changeSearchQuery(q: string)` |
| `export const MyComp = () => {}` | `export function MyComp() {}` |
| `useState` ou `useEffect` em View | View recebe tudo por props |
| Skeleton renderizado no Controller | Skeleton exclusivamente na View |
| `else` com lógica não-trivial | Cláusula de guarda + retorno antecipado |
| Variável local capturando expressão | Substituir por função de consulta |
| `inject()` no corpo do componente | `useRef(inject(...))` no hook do Controller |
| `import { Stack } from "@telefonica/mistica"` | `import * as M from "@telefonica/mistica"` |
| `as` para type casting | Assert functions tipadas |
| Arrays brutos para coleções de domínio | Value object encapsulando `Set` internamente |

---

## Quando ler cada referência

| Contexto de trabalho | Arquivo de referência |
|---|---|
| Entidades, value objects, enums, DbC, builders, CQS | [`references/domain.md`](references/domain.md) |
| React Views e Controllers | [`references/presentation.md`](references/presentation.md) |
| Hooks de aplicação, use cases, gateways, infraestrutura, DI | [`references/application-infra-di.md`](references/application-infra-di.md) |
| Fixtures e setup de testes | [`references/testing.md`](references/testing.md) |
| Nomenclatura e regras gerais de estilo | [`references/code-style.md`](references/code-style.md) |

