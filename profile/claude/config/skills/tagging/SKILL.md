---
name: tagging
description: "Use sempre que o usuário pedir para taguear/instrumentar uma tela, adicionar evento de GA4, screen_view, trackInteraction, mapa de tagueamento/métricas, palit, ou \"rastrear\" cliques e telas para analytics — mesmo que ele não use essas palavras exatas, por exemplo \"preciso saber quando o usuário clica nesse botão\" ou \"adiciona esse evento no analytics\". Implementa tagueamento de analytics nas jornadas de frontend do Framework Brasil."
---

# Tagueamento de Analytics — Frontend

## Contexto: o que os frontends realmente enxergam

A lib de analytics (`analytics-typescript-lib`) resolve internamente, via abstract factory, qual implementação
usar (web, mobile, multi-canal). Nada disso importa para quem consome — os frontends nunca instanciam essa lib
diretamente. Eles recebem uma dependência já resolvida, do tipo `VivoSpaTagging`, injetada em runtime pelo shell
que hospeda o microfrontend (`vivoSpaRootState.state.tagging` em `App.tsx`, com fallback em memória para
desenvolvimento local). Seu trabalho como agente é sempre na perspectiva de consumidor dessa dependência —
nunca mexa na lib de analytics em si.

Como essa dependência chega até a camada de aplicação/apresentação varia conforme o projeto — não existe um
único jeito "certo", e sim dois padrões igualmente válidos que convivem no Framework Brasil hoje:

- **Projetos com container de DI** (ex.: archetype modular): a dependência é resolvida com
  `inject(DEPENDENCIES.TAGGING)`.
- **Projetos sem container de DI** (ex.: archetype SPA, mais antigo): não existe `inject()`/`registry`. O
  `tagging: VivoSpaTagging` chega como parte do state de rota (`state.tagging`) e é passado explicitamente como
  parâmetro para os hooks e handlers que precisam dele.

Antes de implementar, verifique qual dos dois o projeto em questão usa (procure por `shared/infra/di/registry`
ou por `state.tagging`/`VivoSpaState` sendo repassado via props de rota) e siga esse padrão — não introduza um
container de DI num projeto que não tem um, nem passe `tagging` manualmente por props num projeto que já tem
`inject()` disponível.

## A API (`VivoSpaTagging`)

```typescript
interface VivoSpaTagging {
  taggingGA4(event: VivoSpaTaggingTrackingEvent): Promise<void>
  setScreenName(screenName: string, params?: object): Promise<void>
  palit(palitId: string, type: string, screenName: string): Promise<void>
}

interface VivoSpaTaggingTrackingEvent {
  name: string           // 'interaction' | 'noninteraction'
  category: string       // ex.: 'b2c_ecare_next_archetype'
  action: string
  label?: string
  value?: number
  screenName?: string
  component_copy?: string
  component_type?: string
  additionalEventFields?: { key: string; value: string }[]
}
```

Veja `references/api.md` para a assinatura completa e o significado de cada campo antes de gerar um evento —
principalmente se precisar decidir entre `'interaction'` e `'noninteraction'`, que não são apenas rótulos
livres, e sim a convenção usada para diferenciar disparos automáticos (ex.: screen_view) de disparos causados
por ação do usuário.

Três chamadas resolvem praticamente todo pedido de tagueamento:
- **`setScreenName`** — visualização de tela (screen_view). Disparado uma vez, ao montar a tela.
- **`taggingGA4`** — qualquer evento GA4, de interação (clique, seleção, envio de formulário) ou não-interação.
- **`palit`** — evento de interação no formato legado Palit, geralmente disparado junto com `taggingGA4`.

## Onde a lógica de tagueamento vive (e onde nunca deve viver)

A View é um componente puro — só renderiza o que recebe via props, sem `useState`, `useEffect` ou chamadas a
dependências injetadas (ver skill `code-style`). Tagueamento é um efeito colateral de aplicação, então ele
pertence a:

- um **hook de aplicação** dedicado (`use-<tela>-screen-view.ts`, análogo ao hook de resultado de um usecase), ou
- o **hook interno do Controller** (`use<Xxx>Controller`), quando o evento está atrelado a uma ação que o próprio
  Controller já orquestra (navegação, submit, etc).

Nos dois casos, a forma de obter a dependência segue o padrão de DI do projeto:

```typescript
// projeto com container de DI (archetype modular) — injeta uma única vez por montagem com useRef,
// seguindo o mesmo padrão já usado no projeto para outras dependências (gateways, SNACKBAR_RUM_TAGGING)
const taggingRef = useRef<VivoSpaTagging>(inject(DEPENDENCIES.TAGGING))

// projeto sem container de DI (archetype SPA) — tagging chega como parâmetro do hook/handler,
// vindo de state.tagging repassado via props de rota
export function useScreenNameTracking(tagging: VivoSpaTagging) { /* ... */ }
```

Se o pedido for para "adicionar tagueamento no componente X" e X for um componente de View (`*-view.tsx` ou algo
dentro de `view/components/`), não implemente ali. Em vez disso, suba o handler correspondente (o `onPress`/
`onClick`) para o hook do Controller ou UseCase mais próximo, dispare o tagueamento junto com a lógica de negócio
do handler, e passe o handler já pronto para a View via props. Isso costuma já ser necessário de qualquer forma,
porque views puras não devem ter handlers inline com lógica.

**Regra prática para diferenciar os dois fluxos:**
- `screen_view` → sempre dentro de `useEffect` no mount, disparado uma vez.
- eventos de interação (`taggingGA4`/`palit` de clique, seleção, etc) → sempre dentro do handler do evento,
  nunca dentro de `useEffect`. Disparar interação em efeito de montagem gera eventos falsos.

Veja `references/patterns.md` para os dois templates completos, extraídos de implementações reais do projeto.

## Passo a passo de implementação

1. **Identifique a camada certa**: existe já um hook de aplicação ou um hook de Controller para essa tela? Prefira
   estender o hook existente a criar um novo arquivo, a menos que o hook já esteja fazendo outra coisa não
   relacionada (ex.: busca de dados) e o tagueamento mereça seu próprio hook por clareza.
2. **Confirme como a dependência chega**: se o projeto tem container de DI (`shared/infra/di/registry.ts` ou
   equivalente), `DEPENDENCIES.TAGGING` normalmente já está provido no shell (`App.tsx`) — só consuma com
   `inject()`, sem mexer no `App.tsx` nem no arquivo de dependências a menos que a chave esteja realmente
   faltando. Se o projeto não tem container de DI, localize onde `tagging`/`state.tagging` já é recebido (props
   de rota, contexto, etc.) e passe-o explicitamente para o hook/handler que você está criando, como no exemplo
   do archetype SPA.
3. **Valores do evento**: se o usuário forneceu um mapa de tagueamento (Figma, planilha, descrição com
   screenName/category/action/label exatos), use os valores exatos dele, sem alterar nomenclatura. Se não houver
   mapa mas o pedido for específico o bastante (ex.: "dispara um evento de clique no botão X com categoria Y"),
   monte o evento com esses valores e sinalize ao usuário quais campos foram inferidos (ex.: `component_type`)
   para ele validar. Nunca invente eventos adicionais que ninguém pediu, mesmo que pareçam "faltando" — isso é
   decisão de quem mantém o mapa de métricas, não sua.
4. **Implemente** seguindo os templates de `references/patterns.md`, subindo handlers da View para o Controller/
   UseCase quando necessário.
5. **Explique o que ficou de fora**: se algum componente da tela não recebeu tagueamento por não ter sido pedido
   ou por não ter equivalente no mapa, diga isso explicitamente em vez de deixar implícito.

## Referências

- [`references/api.md`](references/api.md) — contrato completo da interface `VivoSpaTagging`, significado de
  cada campo do evento e a convenção `interaction`/`noninteraction`.
- [`references/patterns.md`](references/patterns.md) — templates de hook de screen_view e de tagueamento de
  interação, incluindo o exemplo de subir um handler da View para o Controller.
