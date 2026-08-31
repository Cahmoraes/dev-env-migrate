# Skill: `tagging`

Documentação de uso da skill de tagueamento de analytics (GA4, screen_view, interações, palit) para jornadas de
frontend do Framework Brasil. Para o conteúdo normativo (regras, API, templates), veja [`SKILL.md`](SKILL.md) e
[`references/`](references). Este documento é sobre **como usar** a skill no dia a dia.

## Como invocar

Você não precisa citar a skill pelo nome — o Copilot CLI a aciona automaticamente sempre que o pedido envolve
tagueamento/analytics num contexto de frontend. Frases que disparam a skill:

- "Preciso taguear essa tela"
- "Adiciona um evento de GA4 no clique desse botão"
- "Implementa o screen_view dessa página"
- "Cadê o tagueamento de interação daquele fluxo?"
- "Preciso saber quando o usuário clica nesse botão" (mesmo sem mencionar 'tagging' ou 'analytics')
- "Segue o mapa de métricas dessa tela, pode implementar os eventos?"

Se preferir, também pode invocar explicitamente digitando `tagging` como nome da skill.

## O que passar para a skill

Quanto mais precisos esses dados, menos a skill precisa perguntar ou inferir:

| Informação | Obrigatório? | Exemplo |
|---|---|---|
| Tela/fluxo e módulo onde o evento nasce | Sim | "módulo consumption-details", "tela SubscriptionDetails" |
| Tipo de evento | Sim | screen_view, clique, seleção, submit, palit |
| `screenName` | Sim (screen_view) | `"ConsumptionDetails"` |
| `category` / `action` / `label` do evento GA4 | Recomendado | `category: "b2c_ecare_next_archetype"`, `action: "click"`, `label: "subscription_history"` |
| Mapa de tagueamento (Figma/planilha/descrição) | Opcional, mas ideal | screenshot ou texto com os campos exatos por evento |
| Componente/elemento que dispara a interação | Sim (eventos de interação) | "o botão 'Ver histórico de assinatura' no ActionsSection" |

Se você **não tiver um mapa de tagueamento formal**, ainda assim pode pedir a implementação descrevendo o evento
diretamente (como nos exemplos abaixo) — a skill monta o evento com os valores que você deu e avisa quais campos
ficaram como sugestão a validar (ex.: `component_type`).

## O que a skill NUNCA faz

- Não implementa tagueamento dentro de arquivos de View (`*-view.tsx`, `view/components/*`), mesmo que você peça
  explicitamente para colocar ali — ela sobe a lógica para o hook do Controller/UseCase e explica por quê.
- Não inventa eventos que você não pediu, mesmo que "pareçam faltando" na tela.
- Não mexe na lib de analytics (`analytics-typescript-lib`) nem decide qual implementação (web/mobile) é usada —
  isso é resolvido por trás da interface `VivoSpaTagging` que o frontend já recebe pronta.

## Exemplos de uso

### Exemplo 1 — Screen view (GA4)

**Prompt:**
> "Estou trabalhando no módulo consumption-details do nosso archetype modular. Preciso registrar o screen_view
> dessa tela para o GA4. O screenName é 'ConsumptionDetails' e a categoria do evento é
> 'b2c_ecare_next_archetype'. Pode implementar seguindo os padrões que já existem no projeto?"

**O que a skill faz:** cria (ou estende) um hook de aplicação que injeta a dependência de tagging conforme o
padrão de DI do projeto, e dispara `setScreenName` + `taggingGA4` dentro de um `useEffect` de montagem.

**Resultado esperado** (projeto com container de DI):

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

```tsx
// application/usecase/consumption-details-usecase.tsx
export function ConsumptionDetailsUseCase() {
  useConsumptionDetailsScreenView()
  // ...restante do usecase inalterado
}
```

Nenhum arquivo de `presentation/view` é tocado.

### Exemplo 2 — Evento de interação (clique), subindo o handler da View

**Prompt:**
> "No mesmo módulo consumption-details, preciso taguear o clique em 'Ver histórico de assinatura' (dentro do
> ActionsSection). Quero um evento GA4 com category 'b2c_ecare_next_archetype', action 'click' e label
> 'subscription_history'. Pode implementar?"

**O que a skill faz:** identifica que hoje o `onPress` desse item está vazio/inline na View, sobe esse handler
para o hook do Controller (ou UseCase), injeta a dependência de tagging ali, e repassa o handler já pronto para
a View via props.

**Resultado esperado:**

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
    })
  }, [])

  return { viewSubscriptionHistory }
}
```

```tsx
// presentation/view/components/actions-section.tsx — só recebe o handler pronto
<M.Row title="Ver histórico de assinatura" onPress={onViewSubscriptionHistory} />
```

Os demais itens do `ActionsSection` que não foram mencionados no pedido permanecem intocados — a skill não
tagueia o que não foi pedido.

### Exemplo 3 — Pedido explícito (mas arquiteturalmente incorreto) de implementar na View

**Prompt:**
> "Adiciona um evento de tagueamento GA4 (category 'b2c_ecare_next_archetype', action 'click', label
> 'add_regions') direto no componente ActionsSection, disparado quando o usuário clicar em 'Adicionar
> regiões'."

**O que a skill faz:** entrega o resultado funcional pedido (o evento é disparado ao clicar em "Adicionar
regiões", com os valores exatos informados), mas **não** implementa a chamada de tagueamento dentro do arquivo
de View — sobe a lógica para um hook de aplicação e explica, na resposta, por que a View continua "pura"
mesmo com o pedido literal de colocar ali.

**Resultado esperado:** mesma estrutura do Exemplo 2 (hook + handler repassado via props), mais uma explicação
textual do porquê da escolha de camada.

### Exemplo 4 — Projeto sem container de DI (archetype SPA)

**Prompt:**
> "Nesse projeto (arquétipo SPA, sem `inject()`/registry), preciso do screen_view da tela ErrorArea. category
> 'b2c_ecare_next_archetype', screenName 'ErrorArea'."

**O que a skill faz:** detecta que o projeto não tem container de DI e usa o padrão de parâmetro explícito
(`tagging: VivoSpaTagging` vindo de `state.tagging` via props de rota), em vez de tentar introduzir
`inject()`/`registry` num projeto que não os tem.

**Resultado esperado:**

```typescript
// pages/error-area/hooks/use-screen-view.ts
import type { VivoSpaTagging } from '@fb-app-vivo/fb-app-vivo-types-typescript-lib/modules/vivo-spa-front'
import { useEffect } from 'react'

const SCREEN_NAME = 'ErrorArea'

export function useErrorAreaScreenView(tagging: VivoSpaTagging) {
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
// pages/error-area/controller/error-area.controller.tsx
export function ErrorAreaController({ state }: VivoSpaRouterProviderProps) {
  useErrorAreaScreenView(state.tagging)
  // ...restante do controller
}
```

## Perguntas frequentes

**Preciso ter um mapa de tagueamento (Figma/planilha) para usar a skill?**
Não é obrigatório. Se você tiver, a skill usa os valores exatos dali. Se não tiver, descreva o evento
(category/action/label/screenName) e a skill monta a implementação, sinalizando quais campos foram inferidos.

**A skill funciona em qualquer repositório do Framework Brasil?**
Sim, desde que o frontend receba a dependência `VivoSpaTagging` de alguma forma (container de DI ou prop de
rota). A skill identifica qual dos dois padrões o projeto usa antes de implementar — veja
[`references/patterns.md`](references/patterns.md).

**E se eu pedir para taguear um componente que só existe na View?**
A skill sobe a lógica para o Controller/UseCase mais próximo e passa o handler pronto via props — isso é
necessário de qualquer forma, já que Views puras não devem ter handlers com lógica inline.

**Testes automatizados também são gerados?**
A skill foca na implementação de produção. Para testar o tagueamento, registre um `TaggingMemoryAdapter` (ou
mock equivalente) nas dependências do teste — veja a seção "Testes" em
[`references/patterns.md`](references/patterns.md).
