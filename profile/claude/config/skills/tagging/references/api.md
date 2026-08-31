# API de Tagueamento — Contrato completo

Fonte: `@fb-app-vivo/fb-app-vivo-types-typescript-lib/modules/vivo-spa-front` (tipos) e
`analytics-typescript-lib` (implementação, resolvida via abstract factory — não precisa ser tocada pelo frontend).

## Interface `VivoSpaTagging`

```typescript
export interface VivoSpaTagging {
  taggingGA4: (event: VivoSpaTaggingTrackingEvent) => Promise<void>
  setScreenName: (screenName: string, params?: any) => Promise<void>
  palit: (palitId: string, type: string, screenName: string) => Promise<void>
}
```

Todo consumidor recebe uma instância já resolvida dessa interface — nunca uma classe concreta da lib de
analytics. No archetype modular, ela é obtida com:

```typescript
import { DEPENDENCIES } from "@/shared/infra/di/dependencies"
import { inject } from "@/shared/infra/di/registry"
import type { VivoSpaTagging } from "@fb-app-vivo/fb-app-vivo-types-typescript-lib/modules/vivo-spa-front"

const taggingRef = useRef<VivoSpaTagging>(inject(DEPENDENCIES.TAGGING))
```

No archetype SPA (modelo mais antigo, ainda em produção em alguns fluxos), a mesma interface chega via prop de
rota (`state.tagging`), sem container de DI. Se o repositório em questão usar esse modelo, consuma `state.tagging`
diretamente ao invés de `inject()` — a API do objeto é idêntica, só muda como ele chega até você.

## `taggingGA4(event)`

Dispara um evento GA4. É o método usado tanto para eventos de interação quanto de não-interação.

```typescript
interface VivoSpaTaggingTrackingEvent {
  name: string                 // 'interaction' | 'noninteraction' — ver convenção abaixo
  category: string              // domínio/produto do evento, ex.: 'b2c_ecare_next_archetype'
  action: string                // o que aconteceu, ex.: 'screen_view', 'click', 'submit'
  label?: string                // detalhe adicional da ação, ex.: qual botão/opção
  value?: number                // valor numérico associado, quando fizer sentido (ex.: preço, quantidade)
  screenName?: string           // tela onde o evento ocorreu
  component_copy?: string       // texto visível do componente que originou o evento
  component_type?: string       // tipo do componente, ex.: 'button', 'row', 'link'
  additionalEventFields?: { key: string; value: string }[]  // campos extras livres do mapa de métricas
}
```

### Convenção `name`: `'interaction'` vs `'noninteraction'`

Essa distinção existe em produção (`EventsName` enum no archetype SPA: `INTERACTION = 'interaction'`,
`NON_INTERACTION = 'noninteraction'`) e deve ser respeitada mesmo em repositórios que ainda não têm esse enum
formalizado:

- **`'interaction'`**: o evento nasceu de uma ação do usuário (clique, seleção, submit) — inclusive o
  `screen_view`, que por convenção do projeto é registrado como `name: 'interaction'`, `action: 'screen_view'`.
- **`'noninteraction'`**: o evento aconteceu sem ação direta do usuário (ex.: uma chamada de API que falhou em
  background, uma feature flag resolvida).

Se o mapa de tagueamento fornecido pelo usuário especificar um desses valores, use-o exatamente como está —
essa convenção é o padrão quando não há indicação em contrário.

## `setScreenName(screenName, params?)`

Registra a tela atual para o provedor de analytics. Deve ser chamado uma única vez, ao montar a tela — nunca em
resposta a uma interação do usuário (para isso existe `taggingGA4` com `action: 'click'` etc). Normalmente é
disparado em conjunto com um `taggingGA4` de `screen_view`, como no exemplo de `references/patterns.md`.

`params` aceita um objeto livre com parâmetros adicionais específicos da tela (ex.: id de produto, categoria).

## `palit(palitId, type, screenName)`

Registra um evento de interação no formato legado Palit, normalmente disparado logo antes ou depois do
`taggingGA4` equivalente, no mesmo handler:

```typescript
tagging.palit('primary_button', 'topup', 'archetype')
tagging.taggingGA4({ name: 'interaction', category: 'b2c_ecare_next_archetype', action: 'none_click_button' })
```

Só implemente `palit` se o mapa de tagueamento pedir explicitamente — nem todo evento de interação tem um
equivalente Palit.
