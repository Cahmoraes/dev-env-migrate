# Templates e padrões — Component Test Generator

Padrões canônicos extraídos de `tests/components/src/pages/*`. Copie e ajuste — não escreva do zero.

## Índice
- [Estrutura de pastas](#estrutura-de-pastas)
- [Template `.feature`](#template-feature)
- [Template `.cy.tsx`](#template-cytsx)
- [Variações por módulo](#variacoes-por-modulo)
- [Descoberta de seletores e dependências](#descoberta-de-seletores-e-dependencias)
- [Execução](#execucao)

## Estrutura de pastas

```
tests/components/src/pages/
└── <US>/                     # ex.: PTIECSUB-001, PTIECCD-001, PTIECDS-001
    └── <CT>/                 # ex.: CT001, CT002...
        ├── <CT>.feature      # Gherkin PT-BR
        └── <CT>.cy.tsx       # implementação Cypress + Cucumber
```

Uma linha da tabela de mapeamento = uma pasta `<CT>/`.

## Template `.feature`

Indentação de 2 espaços. Título do Feature em inglês (nome do componente), passos com palavras-chave em inglês e texto em PT-BR.

```gherkin
Feature: CT001 - Subscription Component
  Scenario: Verificar se o componente Subscription renderiza corretamente com tipo Postpaid
    Given Eu visito o componente SubscriptionController com assinatura Postpaid
    When Eu aguardo o carregamento da assinatura
    Then A view de assinatura Postpaid deve ser renderizada
    And Os dados da assinatura devem estar visíveis
```

Quando um CT cobre múltiplos CAs distintos, use um `Scenario` por CA:

```gherkin
Feature: CT001 - Subscription Detail
  Scenario: CA001 - Acesso ao detalhe da assinatura
    Given Eu visito o componente SubscriptionController com assinatura Postpaid
    When Eu seleciono o card da assinatura
    Then A view de assinatura Postpaid deve ser renderizada

  Scenario: CA002 - Exibição dos dados da assinatura
    Given Eu visito o componente SubscriptionController com assinatura Postpaid
    When Eu aguardo o carregamento da assinatura
    Then Os dados da assinatura devem estar visíveis
```

## Template `.cy.tsx`

Boilerplate completo (base: `PTIECSUB-001/CT001`). Ajuste os pontos marcados com `// AJUSTE`.

```tsx
import { Before, Given, Then, When } from "@badeball/cypress-cucumber-preprocessor"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeContextProvider } from "@telefonica/mistica"
import { mount } from "cypress/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import { DEPENDENCIES } from "@/shared/infra/di/dependencies"
import { provide } from "@/shared/infra/di/registry"
import { env } from "@/shared/infra/env/env"
import { setupQueryClient } from "@/shared/infra/react-query/query-client"
import { StorageMemoryAdapter } from "@/shared/infra/storage/storage-memory-adapter"
import { theme } from "@/shared/infra/theme"
// AJUSTE: gateway memory e controller do módulo-alvo
import { SubscriptionGatewayMemory } from "@/subscription/infra/gateway/subscription-gateway-memory"
import { SubscriptionController } from "@/subscription/presentation/controller/subscription-controller"
// AJUSTE: número de "../" conforme profundidade da pasta do CT
import { i18n } from "../../../../../../src/shared/infra/i18n/i18n"

Before(() => {
  provide([
    {
      // AJUSTE: chave de DI e configuração do gateway memory do módulo
      key: DEPENDENCIES.SUBSCRIPTION_GATEWAY,
      dependency: new SubscriptionGatewayMemory({
        type: "postpaid",
        isDependent: env.IS_DEPENDENT,
        isOwner: env.IS_OWNER,
        isEmployee: env.IS_EMPLOYEE,
      }),
    },
    {
      key: DEPENDENCIES.STORAGE,
      dependency: new StorageMemoryAdapter(),
    },
  ])
})

Given(
  "Eu visito o componente SubscriptionController com assinatura Postpaid",
  () => {
    i18n.changeLanguage("pt")

    mount(
      <ThemeContextProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={setupQueryClient()}>
            {/* AJUSTE: rota inicial do módulo */}
            <MemoryRouter initialEntries={["/subscription"]}>
              <SubscriptionController />
            </MemoryRouter>
          </QueryClientProvider>
        </I18nextProvider>
      </ThemeContextProvider>,
    )
  },
)

When("Eu aguardo o carregamento da assinatura", () => {
  cy.get('[data-testid="postpaid-view"]', { timeout: 10000 }).should("exist")
})

When("Eu seleciono o card da assinatura", () => {
  cy.get('[data-testid="subscription-card"]').click()
})

Then("A view de assinatura Postpaid deve ser renderizada", () => {
  // AJUSTE: data-testid real descoberto na view
  cy.get('[data-testid="postpaid-view"]', { timeout: 10000 }).should("exist")
})

Then("Os dados da assinatura devem estar visíveis", () => {
  cy.get('[data-testid="postpaid-view"]')
    .should("be.visible")
    .within(() => {
      cy.get("div").should("have.length.greaterThan", 0)
    })
})
```

### Regras de asserção úteis (vistas nos exemplos)
- Existência: `cy.get('[data-testid="x"]', { timeout: 10000 }).should("exist")`
- Visibilidade + conteúdo: `.should("be.visible").within(() => cy.get("div").should("have.length.greaterThan", 0))`
- Interação (busca): `cy.get('input[type="search"], input[placeholder*="Buscar"]').first().type("teste", { force: true })`
- Timeout maior para views pesadas: `{ timeout: 30000 }`

## Variações por módulo

Cada módulo tem seu gateway, chave de DI, rota e testId raiz. Exemplos reais:

| Módulo | Controller | DEPENDENCIES | Gateway memory | Rota | testId raiz |
|--------|-----------|--------------|----------------|------|-------------|
| subscription | `SubscriptionController` | `SUBSCRIPTION_GATEWAY` + `STORAGE` | `SubscriptionGatewayMemory({ type, isDependent, isOwner, isEmployee })` | `/subscription` | `postpaid-view` / `control-view` / `prepaid-view` |
| consumption-details | `ConsumptionDetailsController` | `CONSUMPTION_DETAILS_GATEWAY` + `BROADCAST` | `ConsumptionDetailsGatewayMemory()` | `/consumption-details` | `consumption-details-view` |
| digital-services | `DigitalServiceController` | `DIGITAL_SERVICES_GATEWAY` | `DigitalServicesGatewayMemory()` | `/digital-services` | `digital-services-view` |

Para módulos não listados, descubra os valores via grep (próxima seção). Nunca assuma — confirme na codebase.

## Descoberta de seletores e dependências

```bash
# Controller do módulo
find src -path "*presentation/controller/*<modulo>*-controller.tsx"

# testIds expostos pelas views do módulo
grep -rn "testId\s*=\|testID=" src/<modulo>/presentation

# Gateway memory e chave de DI
find src/<modulo>/infra -name "*gateway-memory*"
grep -rn "<MODULO>_GATEWAY\|DEPENDENCIES\." src/<modulo> src/shared/infra/di/dependencies.ts

# Adapters que o controller injeta (Before deve registrar os mesmos)
grep -rn "inject<\|DEPENDENCIES\." src/<modulo>/presentation/controller
```

Cada `Então` de um CA deve ancorar em um `data-testid` que exista de fato (confirmado pelo grep) ou em um comportamento verificável.

## Execução

```bash
# rodar todos os testes de componente
npm run test:component

# gerar/atualizar baseline de snapshot visual (quando o CT usa matchImageSnapshot)
npm run test:component:update-snapshot
```

O `specPattern` é `tests/components/**/*.feature` (ver `cypress.config.ts`), então basta criar os arquivos no diretório correto — não é preciso registrar o spec em lugar nenhum.

Se um teste falhar por seletor: reveja o `data-testid` contra a view. Se falhar por timeout: aumente para `{ timeout: 30000 }`. Se falhar por DI: confira se todos os gateways/adapters injetados pelo controller estão no `provide([...])`.
