# Camada de Aplicação, Infraestrutura e Injeção de Dependência

## Sumário

1. [Camada de Aplicação](#camada-de-aplicação)
2. [Camada de Infraestrutura](#camada-de-infraestrutura)
3. [Injeção de Dependência](#injeção-de-dependência)

---

## Camada de Aplicação

### Hooks retornam discriminated unions

Hooks que buscam dados retornam uma discriminated union que representa todos os estados possíveis. O consumidor faz narrowing pelo campo `isLoading`.

```typescript
type Success = {
  isLoading: false
  consumption: Consumption
}

type Fail = {
  isLoading: true
  consumption: null
}

export type ConsumptionDetailsResult = Success | Fail

export function useConsumptionDetailsResult(): ConsumptionDetailsResult {
  const consumptionDetailsGateway = useRef<ConsumptionDetailsGateway>(
    inject(DEPENDENCIES.CONSUMPTION_DETAILS_GATEWAY),
  )
  const consumption = useRef<Consumption | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchConsumption()
    async function fetchConsumption() {
      try {
        setIsLoading(true)
        consumption.current = await consumptionDetailsGateway.current.consumption()
      } finally {
        setIsLoading(false)
      }
    }
  }, [])

  return {
    consumption: consumption.current,
    isLoading,
  } as ConsumptionDetailsResult
}
```

### UseCase orquestra hooks e repassa para a View

O componente UseCase não tem lógica de busca. Ele chama os hooks e passa os resultados para a View.

```typescript
export function ConsumptionDetailsUseCase() {
  const consumptionResult = useConsumptionDetailsResult()
  const countriesResult = useCountriesResult()
  const contactsResult = useContactsResult()

  return (
    <ConsumptionDetailsView
      consumptionResult={consumptionResult}
      countriesResult={countriesResult}
      contactsResult={contactsResult}
    />
  )
}
```

### Gateway — contrato mínimo na camada de aplicação

Interfaces de gateway ficam em `application/gateway/` e definem apenas o contrato necessário. Sem implementação.

```typescript
export interface SubscriptionGateway {
  get(): Promise<Subscription>
}
```

---

## Camada de Infraestrutura

### Gateways de memória sufixados com `Memory`

Implementações em memória (para testes e desenvolvimento) usam o sufixo `GatewayMemory` ou `MemoryAdapter`.

```typescript
export class SubscriptionGatewayMemory implements SubscriptionGateway {
  public async get(): Promise<Subscription> {
    return this.createSubscription(this.planConfig.type)
  }
}

export class StorageMemoryAdapter implements Storage { ... }
export class BroadcastMemoryAdapter implements Broadcast { ... }
```

### Dados estáticos em `dummy/`

Respostas simuladas de API ficam em arquivos JSON dentro de `infra/gateway/dummy/`.

```
infra/
  gateway/
    dummy/
      postpaid.json
      prepaid-with-promotion.json
      fixed-siebel.json
```

### Fronteiras de módulo

Nunca importe de `infra/` de outro módulo. Importe apenas de `application/` do módulo alvo.

---

## Injeção de Dependência

O `Registry` é um Singleton que mapeia chaves de dependências para implementações.

### Registro

```typescript
provide(DEPENDENCIES.SUBSCRIPTION_GATEWAY, new SubscriptionGatewayMemory())

// ou múltiplas de uma vez
provide([
  { key: DEPENDENCIES.SUBSCRIPTION_GATEWAY, dependency: new SubscriptionGatewayMemory() },
  { key: DEPENDENCIES.STORAGE, dependency: new StorageMemoryAdapter() },
])
```

### Injeção

```typescript
const gateway = inject<SubscriptionGateway>(DEPENDENCIES.SUBSCRIPTION_GATEWAY)
```

### Em testes

Dependências são registradas no `beforeEach`, antes de montar o componente.

```typescript
beforeEach(() => {
  provide(DEPENDENCIES.SUBSCRIPTION_GATEWAY, new SubscriptionGatewayMemory())
})
```
