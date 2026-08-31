# Domain Layer — Entidades, Value Objects e Contratos

## Sumário

1. [Entidades e Value Objects](#entidades-e-value-objects)
2. [Enums com `as const`](#enums-com-as-const)
3. [Design by Contract (DbC)](#design-by-contract-dbc)
4. [Builders para Agregados Complexos](#builders-para-agregados-complexos)
5. [CQS — Segregação de Consultas e Comandos](#cqs--segregação-de-consultas-e-comandos)
6. [Substituição de Variável Local por Consulta](#substituição-de-variável-local-por-consulta)

---

## Entidades e Value Objects

### Construtor privado + factory `create()`

O construtor é sempre `private`. A criação pública é feita via `static create()`, que aplica validações e transformações antes de instanciar.

```typescript
export class Plan implements ToPersistence {
  private readonly _isOwner: boolean
  private readonly _isDependent: boolean

  private constructor(props: PlanConstructor) {
    this._isOwner = props.isOwner
    this._isDependent = props.isDependent
  }

  public static create(props: PlanConstructor): Plan {
    return new Plan(props)
  }

  get isOwner(): boolean { return this._isOwner }
  get isDependent(): boolean { return this._isDependent }
}
```

### Propriedades privadas com prefixo `_`

Toda propriedade interna usa `_` para sinalizar que é privada ou protegida. Sempre `readonly` quando o valor não muda após a construção.

```typescript
private readonly _id: string
private readonly _name: string
protected readonly _plan: Plan
```

### Sem setters públicos

Value objects são imutáveis. Entidades só expõem mutação via métodos de comando explícitos que comunicam a intenção.

```typescript
// correto — mutação via método de comando
public add(aDetail: BenefitDetail): this {
  this._value.add(aDetail)
  return this
}

// incorreto — setter genérico
set benefits(value: Benefits) { this._benefits = value }
```

### Hierarquia com classes abstratas

Entidades-base abstratas centralizam comportamento comum. Subclasses especializam.

```typescript
export abstract class Subscription {
  protected readonly _type: SUBSCRIPTION_TYPES
  protected constructor(props: SubscriptionConstructor) { ... }

  get line(): string { ... }
  get itBelongsToOwner(): boolean { return this._plan.isOwner }
}

export class Postpaid extends Subscription implements ToPersistence {
  private readonly _product: Product
  protected constructor(props: PostPaidConstructor) { super(props); ... }
  public static create(props: PostPaidConstructor): Postpaid { ... }
}
```

### Coleções como Value Objects

Coleções nunca são expostas como arrays brutos. São encapsuladas em classes de domínio usando `Set` internamente.

```typescript
export class Benefits {
  protected _value: Set<BenefitDetail>

  protected constructor(props: BenefitDetail[]) {
    this._value = new Set(props)
  }

  public static create(props: BenefitDetail[] = []): Benefits {
    return new Benefits(props)
  }

  public add(aDetail: BenefitDetail): this {
    this._value.add(aDetail)
    return this
  }

  get details(): BenefitDetail[] {
    return [...this._value.values()]
  }
}
```

### Interface `ToPersistence`

Value objects que precisam ser serializados implementam `ToPersistence`, expondo apenas uma forma canônica de persistência.

```typescript
export interface ToPersistence {
  toPersistence(): object
}

export class Plan implements ToPersistence {
  public toPersistence(): object {
    return {
      isOwner: this._isOwner,
      isDependent: this._isDependent,
    }
  }
}
```

### Método `compare()` para consultas semânticas

Entidades encapsulam lógica de comparação interna, evitando lógica de busca espalhada nos consumidores.

```typescript
export class DigitalService {
  public compare(aString: string): boolean {
    return this._title.toLocaleLowerCase().includes(aString.toLocaleLowerCase())
  }
}
```

---

## Enums com `as const`

Enums são definidos como objetos `as const` com um type alias de mesmo nome, garantindo type-safety em runtime e em compilação.

```typescript
export const SUBSCRIPTION_TYPES = {
  postpaid: "postpaid",
  control: "control",
  prepaid: "prepaid",
} as const

export type SUBSCRIPTION_TYPES =
  (typeof SUBSCRIPTION_TYPES)[keyof typeof SUBSCRIPTION_TYPES]
```

O nome do tipo e do objeto são idênticos (type/value merge). Isso permite usar `SUBSCRIPTION_TYPES.postpaid` como valor e `SUBSCRIPTION_TYPES` como tipo.

---

## Design by Contract (DbC)

Três funções de contrato protegem invariantes do sistema. Todas lançam `ContractError` com o tipo de violação.

| Função | Momento | Uso |
|---|---|---|
| `requires(condition, msg)` | Entrada — pré-condição | Valida argumentos antes de executar |
| `ensures(condition, msg)` | Saída — pós-condição | Garante o resultado após execução |
| `invariant(condition, msg)` | Qualquer — invariante | Verifica regra permanente da classe |

```typescript
// pré-condição: verifica entrada antes de criar
public static create(props: TotalConstructor): Total {
  requires(props.type === SUBSCRIPTION_TYPES["fixed-total"], "Invalid subscription type")
  requires(props.name, "Invalid subscription name")
  requires(props.mobile, "Invalid subscription mobile")
  return new Total(props)
}

// pós-condição: garante que o resultado é o esperado
const subscription = builder.create()
ensures(
  subscription instanceof Siebel,
  `Subscription ${subscription.type} inválida. Deve ser fixed-siebel`,
)
return subscription
```

Contratos são aplicados **especialmente no `create()` de agregados e builders**, garantindo que objetos inválidos nunca existam no sistema.

---

## Builders para Agregados Complexos

Quando um agregado tem muitas dependências opcionais ou construção em etapas, usa-se o padrão Builder com fluent interface.

### Estrutura do Builder

- `private constructor` recebe os dados base
- `public static from()` inicia a construção (semântico: "construir a partir de")
- Métodos `addXxx()` retornam `this` para encadeamento
- `create()` aplica `requires` em tudo obrigatório, constrói e chama `clear()`
- `private clear()` anula referências após construção (evita reutilização indevida)

```typescript
export class MobileBuilder {
  private _subscriptionDetail: MobileBuilderConstructor | null
  private _plan?: Plan | null
  private _product?: Product | null

  private constructor(subscriptionDetail: MobileBuilderConstructor) {
    this._subscriptionDetail = subscriptionDetail
  }

  public static from(subscriptionDetail: MobileBuilderConstructor): MobileBuilder {
    return new MobileBuilder(subscriptionDetail)
  }

  public addPlan(planDetail: PlanConstructor): this {
    this._plan = Plan.create(planDetail)
    return this
  }

  public create(): Mobile {
    requires(this._subscriptionDetail?.type, "Invalid Subscription Type")
    requires(this._plan, "Invalid plan")
    requires(this._product, "Invalid product")
    const subscription = ...
    ensures(subscription, "Failed to create subscription")
    this.clear()
    return subscription
  }

  private clear(): void {
    this._subscriptionDetail = null
    this._plan = null
    this._product = null
  }
}

// uso
MobileBuilder.from({ id, type, address, name })
  .addPlan({ isOwner: true, hasPromotion: false })
  .addProduct({ ... })
  .addCallsToMobilePhones([...])
  .create()
```

---

## CQS — Segregação de Consultas e Comandos

Métodos são **ou** consultas (retornam dados, sem efeito colateral) **ou** comandos (causam efeito, retornam `void` ou `this`). Nunca os dois.

```typescript
// query — retorna dado sem mutar
get details(): BenefitDetail[] {
  return [...this._value.values()]
}

get itBelongsToOwner(): boolean {
  return this._plan.isOwner
}

// command — muta estado, retorna this para fluency
public add(aDetail: BenefitDetail): this {
  this._value.add(aDetail)
  return this
}

// na camada de aplicação — separação clara
function changeSearchQuery(searchTerm: string) {   // command
  startTransition(() => { setSearchQuery(searchTerm) })
}

const digitalServicesByCategory = DigitalServicesByCategory.create({  // query
  digitalServices,
  searchQuery,
})
```

---

## Substituição de Variável Local por Consulta

Variáveis locais que apenas capturam o valor de uma expressão são substituídas por funções de consulta. Isso torna o código mais legível e mais fácil de testar.

```typescript
// correto — função de consulta, sem variável local
function internet(): Internet {
  return subscription.product.internet
}

return (
  <Detail.Section title="INTERNET">
    <Detail.Item title="Dados" text={internet().downloadSpeed} />
    <Detail.Item title="Upload" text={internet().uploadSpeed} />
  </Detail.Section>
)

// incorreto — variável local desnecessária
const internet = subscription.product.internet
return (
  <Detail.Section title="INTERNET">
    <Detail.Item title="Dados" text={internet.downloadSpeed} />
  </Detail.Section>
)
```

A mesma técnica é aplicada em funções que encapsulam lógica booleana:

```typescript
// correto — encapsula a regra em função nomeada
function isInternetProduct(productType: string): boolean {
  return productType === FixedProductsFromRequest.internet
}

// incorreto — lógica booleana inline no if
if (productType === "internet") { ... }
```
