# Fixtures para Testes

## Prefixo `make*` e suporte a overrides

Factories de teste ficam em `<module>/fixture/` com prefixo `make`. Aceitam overrides parciais para customizar cenários sem repetir configuração.

```typescript
export const defaultPlanParams: PlanConstructor & Partial<Pick<SubscriptionConstructor, "type">> = {
  isOwner: true,
  hasPromotion: false,
  isDependent: false,
  isEmployee: false,
  type: "postpaid",
}

export function makePostpaidOrControlSubscription(
  props: makePostpaidOrControlSubscriptionInput = defaultPlanParams,
): Postpaid {
  return MobileBuilder.from({ ... })
    .addPlan({ ...defaultPlanParams, ...props })
    .create()
}
```

## Uso em testes

```typescript
// cenário padrão
const subscription = makePostpaidOrControlSubscription()

// cenário customizado
const dependentSubscription = makePostpaidOrControlSubscription({ isDependent: true })
const employeeSubscription = makePostpaidOrControlSubscription({ isEmployee: true, type: "control" })
```

## Setup de dependências em testes

Dependências são registradas no `beforeEach`, antes de montar o componente. Nunca no escopo global do arquivo de teste.

```typescript
beforeEach(() => {
  provide(DEPENDENCIES.SUBSCRIPTION_GATEWAY, new SubscriptionGatewayMemory())
})
```
