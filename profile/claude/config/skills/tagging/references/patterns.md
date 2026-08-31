# Templates de Implementação

Existem dois padrões de DI válidos no Framework Brasil, e a escolha entre eles não é estilística — depende de
qual o projeto em questão já usa:

- **Com container de DI** (ex.: archetype modular): a dependência é resolvida dentro do próprio hook, com
  `useRef(inject(DEPENDENCIES.TAGGING))`.
- **Sem container de DI** (ex.: archetype SPA): não existe `inject()`. O hook recebe `tagging: VivoSpaTagging`
  como parâmetro, vindo de `state.tagging` que o Controller já tem via props de rota.

Os templates abaixo mostram as duas variantes lado a lado para os dois fluxos (screen view e interação). Use-os
como ponto de partida, ajustando nomes e valores ao mapa de tagueamento da tela em questão — nunca introduza um
container de DI num projeto que não tem um, nem passe `tagging` manualmente por props num projeto que já expõe
`inject()`.

## 1. Screen view (não-interação de montagem, mas convenção `name: 'interaction'`)

### 1a. Com container de DI

Vive em `application/hook/`, ao lado dos outros hooks de resultado da tela. Consumido pelo UseCase, não pelo
Controller — é um dado de execução da tela, assim como os hooks que buscam dados.

```typescript
// application/hook/use-consumption-details-screen-view.ts
import { useEffect, useRef } from "react"
import type { VivoSpaTagging } from "@fb-app-vivo/fb-app-vivo-types-typescript-lib/modules/vivo-spa-front"
import { DEPENDENCIES } from "@/shared/infra/di/dependencies"
import { inject } from "@/shared/infra/di/registry"

const SCREEN_NAME = "ConsumptionDetails"

export function useConsumptionDetailsScreenView() {
  const taggingRef = useRef<VivoSpaTagging>(inject(DEPENDENCIES.TAGGING))

  useEffect(() => {
    trackScreenView()
    async function trackScreenView() {
      await taggingRef.current.setScreenName(SCREEN_NAME)
      await taggingRef.current.taggingGA4({
        name: "interaction",
        category: "b2c_ecare_next_archetype",
        action: "screen_view",
        screenName: SCREEN_NAME,
      })
    }
  }, [])
}
```

```typescript
// application/usecase/consumption-details-usecase.tsx
export function ConsumptionDetailsUseCase() {
  useConsumptionDetailsScreenView()

  const consumptionResult = useConsumptionDetailsResult()
  // ...demais hooks e return inalterados
}
```

Repare que o hook não retorna nada — ele só produz o efeito colateral. O UseCase simplesmente o chama.

### 1b. Sem container de DI

Vive junto das `hooks/` da própria tela (ex.: `pages/<tela>/hooks/use-screen-view.ts`). Recebe `tagging` como
parâmetro e é chamado pelo Controller, que já tem `state.tagging` disponível via props de rota. O template abaixo
reflete um padrão já usado em produção no archetype SPA:

```typescript
// pages/consumption-details/hooks/use-screen-view.ts
import type { VivoSpaTagging } from '@fb-app-vivo/fb-app-vivo-types-typescript-lib/modules/vivo-spa-front'
import { useEffect } from 'react'

const SCREEN_NAME = 'ConsumptionDetails'

export function useConsumptionDetailsScreenView(tagging: VivoSpaTagging) {
  useEffect(() => {
    async function track() {
      await tagging.setScreenName(SCREEN_NAME)
      await tagging.taggingGA4({
        name: 'interaction',
        category: 'b2c_ecare_next_archetype',
        action: 'screen_view',
        screenName: SCREEN_NAME,
      })
    }
    track()
  }, [tagging])
}
```

```tsx
// pages/consumption-details/controller/consumption-details.controller.tsx
export function ConsumptionDetailsController({ state }: VivoSpaRouterProviderProps) {
  useConsumptionDetailsScreenView(state.tagging)
  // ...restante do controller
}
```

## 2. Interação do usuário (clique, seleção, submit)

O erro mais comum aqui é deixar o handler dentro da View (`onPress={() => {...}}` inline). Isso quebra a regra de
View pura e também impede o teste do tagueamento isoladamente. O handler deve nascer no hook do Controller (ou
UseCase, se a ação envolver lógica de negócio da tela) e ser passado pronto para a View — independente de qual
padrão de DI o projeto usa.

**Antes** (handler inline na View — não faça isso):
```tsx
// presentation/view/components/actions-section.tsx
<M.Row title="Ver histórico de assinatura" onPress={() => {}} />
```

### 2a. Com container de DI — handler sobe para o hook do Controller

```typescript
// presentation/controller/consumption-details-controller.tsx (hook interno)
function useConsumptionDetailsController() {
  const taggingRef = useRef<VivoSpaTagging>(inject(DEPENDENCIES.TAGGING))

  const viewSubscriptionHistory = useCallback(() => {
    taggingRef.current.taggingGA4({
      name: "interaction",
      category: "b2c_ecare_next_archetype",
      action: "click",
      label: "subscription_history",
      screenName: "ConsumptionDetails",
      component_type: "row",
    })
    // ...navegação ou lógica de negócio da ação, se houver
  }, [])

  return { viewSubscriptionHistory }
}
```

### 2b. Sem container de DI — handler recebe `tagging` como parâmetro/closure

Este é um padrão já usado em produção no archetype SPA: o Controller já tem `state.tagging` (via props de rota)
e usa diretamente dentro do `useCallback` do handler, sem nenhum hook de DI:

```tsx
// pages/consumption-details/controller/consumption-details.controller.tsx
export function ConsumptionDetailsController({ state }: VivoSpaRouterProviderProps) {
  const viewSubscriptionHistory = useCallback(() => {
    state.tagging.taggingGA4({
      name: 'interaction',
      category: 'b2c_ecare_next_archetype',
      action: 'click',
      label: 'subscription_history',
    })
    // ...navegação ou lógica de negócio da ação, se houver
  }, [state])

  return <ConsumptionDetailsView viewSubscriptionHistory={viewSubscriptionHistory} />
}
```

Nos dois casos, a View recebe o handler pronto via props:
```tsx
// a View passa a receber o handler pronto via props, sem saber que existe tagueamento
<M.Row title="Ver histórico de assinatura" onPress={viewSubscriptionHistory} />
```

Se o mapa de tagueamento também define um evento Palit para a mesma ação, dispare-o no mesmo handler, junto com
`taggingGA4` — veja `references/api.md`.

## Testes

**Com container de DI**: registre um `TaggingMemoryAdapter` (ou mock equivalente) no `beforeEach`, antes de
montar o componente:

```typescript
beforeEach(() => {
  provide(DEPENDENCIES.TAGGING, new TaggingMemoryAdapter())
})
```

**Sem container de DI**: instancie o mock e passe-o diretamente como `tagging`/`state.tagging` nas props do
componente ou como argumento do hook em cada teste — não há registro global a fazer.

Nos dois casos, inspecione `taggingGA4Tracking`/`setScreenNameTracking` do adapter para verificar que o evento
correto foi disparado, sem depender de um provedor de analytics real.
