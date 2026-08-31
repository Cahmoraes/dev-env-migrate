# Camada de Apresentação — Views e Controllers

## Sumário

1. [Views](#views)
2. [Controllers](#controllers)

---

## Views

Views são componentes puros de apresentação. Recebem tudo via props — sem `useState`, sem `useEffect`, sem chamadas a gateways.

### `testId` como propriedade estática

Toda View declara seu `testId` como propriedade estática antes da declaração da função. Isso permite referenciar o seletor sem instanciar o componente.

```typescript
PrepaidView.testId = "prepaid-view"
export function PrepaidView({ subscription, selectTabByIndex, selectedTab, tabs }: PrepaidViewProps) {
  ...
  return (
    <M.Stack space={64} dataAttributes={{ testid: PrepaidView.testId }}>
      ...
    </M.Stack>
  )
}
```

### Funções de renderização internas

Toda seção do JSX é extraída em uma função de renderização interna com prefixo `render`. O `return` da View fica limpo, legível como um esboço da tela. Elas devem ficar dentro do componente React para terem acesso às propriedades internas, sem precisar parametrizá-las!

```typescript
export function PrepaidView({ subscription, selectTabByIndex, selectedTab, tabs }: PrepaidViewProps) {
  function renderTitle() {
    return <Title title="Detalhes da assinatura" />
  }

  function renderTabs() {
    const tabsForRender = tabs.map((tab) => ({ text: tab.text }))
    return (
      <M.Box>
        <M.Tabs selectedIndex={selectedTab} onChange={selectTabByIndex} tabs={tabsForRender} />
      </M.Box>
    )
  }

  function renderTabContent() {
    const selectedType = tabs[selectedTab].type
    switch (selectedType) {
      case "promotion":
        return <PromotionSection subscription={subscription} />
      case "subscription":
        return <M.Stack space={24}>...</M.Stack>
      default:
        return null
    }
  }

  return (
    <M.Stack space={64} dataAttributes={{ testid: PrepaidView.testId }}>
      {renderTitle()}
      {renderTabs()}
      {renderTabContent()}
    </M.Stack>
  )
}
```

### Mistica sempre com namespace `M.*`

Todos os componentes do design system são importados como namespace. Nunca importações nomeadas individuais (exceto quando há conflito explícito documentado).

```typescript
import * as M from "@telefonica/mistica"

// correto
<M.Stack space={24}>
  <M.Box paddingX={16}>
    <M.Title1 as="h3">{title}</M.Title1>
  </M.Box>
</M.Stack>

// incorreto
import { Stack, Box, Title1 } from "@telefonica/mistica"
```

### Views recebem tudo via props

```typescript
export interface PostpaidViewProps {
  subscription: Mobile
}

export function PostpaidView({ subscription }: PostpaidViewProps) {
  function renderInternet() {
    return subscription.itBelongsToOwner && <InternetSection subscription={subscription} />
  }

  function renderSMS() {
    return subscription.not.itBelongsToEmployee && <SMSSection subscription={subscription} />
  }

  return (
    <M.Stack space={64}>
      {renderInternet()}
      {renderSMS()}
    </M.Stack>
  )
}
```

### Skeleton vive exclusivamente na View

A lógica de exibir skeleton (loading placeholder) é da View. O Controller nunca renderiza Skeleton diretamente.

```typescript
// na View
function renderPhoneSection() {
  const { consumption, isLoading } = consumptionResult
  if (isLoading) return <Skeleton />
  return (
    <M.Box paddingTop={8} paddingX={16}>
      <M.Text2 regular color="textSecondary">{consumption.phone.formatted}</M.Text2>
    </M.Box>
  )
}
```

---

## Controllers

### Hook extraído do Controller

O Controller extrai um custom hook local (`useXxxController`) que contém toda a lógica de estado e efeitos. O componente Controller apenas consome o hook e decide qual View renderizar.

```typescript
function useSubscriptionController() {
  const navigate = useNavigate()
  const subscriptionGateway = useRef<SubscriptionGateway>(
    inject(DEPENDENCIES.SUBSCRIPTION_GATEWAY),
  )
  const [isLoading, setIsLoading] = useState(true)
  const subscription = useRef<Subscription | null>(null)

  useEffect(() => {
    fetchSubscription()
    async function fetchSubscription() {
      try {
        subscription.current = await subscriptionGateway.current.get()
      } catch {
        navigate(RoutesURL.ERROR_URL)
      } finally {
        setIsLoading(false)
      }
    }
  }, [navigate])

  return { isLoading, subscription: subscription.current }
}

export function SubscriptionController() {
  const { subscription, isLoading } = useSubscriptionController()

  function renderSubscriptionView() {
    if (isLoading) return <SkeletonView />
    if (!subscription) return <ErrorAreaController />
    assertSubscription(subscription)
    switch (subscription.type) {
      case "postpaid":
        assertPostpaidSubscription(subscription)
        return <PostpaidUseCase subscription={subscription} />
      case "prepaid":
        assertPrepaidSubscription(subscription)
        return <PrepaidUseCase subscription={subscription} />
      default:
        return <ErrorAreaController />
    }
  }

  return <Suspense fallback={<SkeletonView />}>{renderSubscriptionView()}</Suspense>
}
```

### Assert functions para type narrowing

Type narrowing em switch/if é feito por assert functions tipadas, nunca por type casting ou `as`.

```typescript
function assertPostpaidSubscription(anObject: any): asserts anObject is Postpaid {
  if (anObject?.type !== SUBSCRIPTION_TYPES.postpaid) {
    throw new Error("Invalid Postpaid Subscription")
  }
}
```

### Injeção de dependência via `useRef`

Gateways injetados no Controller ficam em `useRef` para que `inject()` seja chamado uma única vez por montagem, não em cada render.

```typescript
const subscriptionGateway = useRef<SubscriptionGateway>(
  inject(DEPENDENCIES.SUBSCRIPTION_GATEWAY),
)
```

### Lazy loading para UseCases

UseCases são carregados com `lazy()` para otimizar o bundle. O `Suspense` fica no Controller.

```typescript
const PostpaidUseCase = lazy(() =>
  import("@/subscription/application/usecase/postpaid-usecase").then(
    (module) => ({ default: module.PostpaidUseCase }),
  ),
)
```
