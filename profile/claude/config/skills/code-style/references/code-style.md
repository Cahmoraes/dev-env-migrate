# Nomenclatura e Estilo de Código

## Sumário

1. [Nomenclatura](#nomenclatura)
2. [Estilo de Código](#estilo-de-código)

---

## Nomenclatura

### Sem prefixos técnicos

Nomes comunicam intenção de negócio, não artefato técnico.

```typescript
// correto — comunica o conceito do domínio
interface SubscriptionGateway { get(): Promise<Subscription> }

// incorreto — prefixo técnico sem valor semântico
interface ISubscriptionGateway { get(): Promise<Subscription> }
```

### Sem prefixos get/set

Getters e setters seguem a linguagem do domínio.

```typescript
// correto
get name(): string { return this._name }
get status(): SubscriptionStatus { ... }

function changeSearchQuery(searchTerm: string) { ... }
function selectTabByIndex(tabIndex: number) { ... }

// incorreto
getName(): string { return this._name }
setSearchQuery(query: string) { ... }
```

### Booleanos semânticos

Propriedades booleanas comunicam o que significam no negócio.

```typescript
// correto
get itBelongsToOwner(): boolean { return this._plan.isOwner }
get hasPromotion(): boolean { return this._plan.hasPromotion }
get isJeri(): boolean { return this._isJeri }

// incorreto
get owner(): boolean { return this._plan.isOwner }
get promotion(): boolean { return this._plan.hasPromotion }
```

### Negação semântica via `.not`

Para evitar dupla negação no código de consumo, entidades expõem um getter `.not` com propriedades opostas nomeadas semanticamente.

```typescript
// na entidade
get not() {
  return {
    itBelongsToEmployee: !this.itBelongsToEmployee,
    hasPromotion: !this.hasPromotion,
    itBelongsToOwner: !this.itBelongsToOwner,
  }
}

// na view — leitura natural
subscription.not.itBelongsToEmployee
```

### Sufixos de tipos de entrada

- `XxxConstructor` — props do construtor privado
- `XxxCreate` — props da factory pública `create()`
- `XxxBuilderConstructor` — props do builder

```typescript
export interface PlanConstructor { isOwner: boolean; isDependent: boolean; ... }
export interface DigitalServiceCreate { id: number; title: string; category: string; ... }
```

---

## Estilo de Código

### `const` em tudo

Toda declaração usa `const`. Nunca `let` se o valor não será reatribuído.

```typescript
const subscription = makePostpaidOrControlSubscription()
const digitalServicesByCategory = DigitalServicesByCategory.create({ digitalServices, searchQuery })
```

### Sem `else` — cláusulas de guarda

Condições invertidas com retorno antecipado eliminam aninhamento e o `else`.

```typescript
// correto — cláusulas de guarda
function requires(condition: unknown, messageOrError: string | Error): asserts condition {
  if (condition) return
  if (typeof messageOrError === "string") {
    throw new ContractError("Precondition", messageOrError)
  }
  if (messageOrError instanceof Error) {
    throw messageOrError
  }
}

// incorreto — else aninhado
function requires(condition: unknown, messageOrError: string | Error): asserts condition {
  if (!condition) {
    if (typeof messageOrError === "string") {
      throw new ContractError("Precondition", messageOrError)
    } else {
      throw messageOrError
    }
  }
}
```

### Sem linhas em branco dentro de funções e métodos

Funções não têm linhas em branco internas. Se for necessário separar blocos, é sinal de que a função deve ser dividida.

```typescript
// correto
public static create(props: ConsumptionCreate): Consumption {
  const phone = Phone.create(props.phone)
  const products = Products.create(props.products)
  return new Consumption({ phone, products, dailyRenewal: props.dailyRenewal })
}

// incorreto
public static create(props: ConsumptionCreate): Consumption {
  const phone = Phone.create(props.phone)

  const products = Products.create(props.products)

  return new Consumption({ phone, products, dailyRenewal: props.dailyRenewal })
}
```

### Funções fazem uma única coisa

Se uma função tem mais de uma responsabilidade, ela é dividida. O nome da função comunica exatamente o que faz.

```typescript
// correto — cada função tem responsabilidade única
private createMobileSubscription(): Mobile { ... }
private createFixedSiebelSubscription(): Siebel { ... }
private createPrepaidSubscription(): Prepaid { ... }

private subscriptionDTO() {
  switch (this.planConfig.type) {
    case "postpaid": return postpaidSubscriptionDTO
    case "prepaid": return prepaidSubscriptionDTO
    ...
  }
}

// incorreto — função com múltiplas responsabilidades
private createSubscriptionFromType(type: string): Subscription {
  // busca DTO, aplica transformação, valida, constrói — tudo junto
}
```

### Declarações de função, nunca arrow function exportada

Componentes e funções exportadas são sempre declarações de função.

```typescript
// correto
export function PrepaidView({ subscription }: PrepaidViewProps) { ... }
export function makePostpaidOrControlSubscription(props = defaultPlanParams): Postpaid { ... }

// incorreto
export const PrepaidView = ({ subscription }: PrepaidViewProps) => { ... }
export const makePostpaidOrControlSubscription = (props = defaultPlanParams): Postpaid => { ... }
```

### Código próximo à margem esquerda

Sem aninhamento desnecessário. Cláusulas de guarda e separação de funções mantêm o código no nível mais raso possível.
