# Estrutura de Projeto — Diretrizes de Code Review

> Referência para a skill `code-review`.
> Define as convenções e padrões estruturais do projeto, com foco em organização de pastas, nomeação de arquivos, separação de responsabilidades e extensão de arquivos.

## Separação entre Controller e View

**Categoria: BLOQUEANTE**

### Controller (`*.controller.tsx`)

- Contém lógica de negócio, estado e APIs
- Pode usar React Hook Form + Zod
- **Nunca renderiza elementos visuais ou Skeletons**
- Pode receber um objeto `VivoSpaState` via props, desestruturado como `state`
- Controller pode conter `useTranslation`

### View (`*.view.tsx`)

- Responsável apenas por renderização e layout
- Recebe dados e callbacks por props
- Pode conter Skeletons e hooks de UI como `useTranslation`, `useTheme`
- **Não acessa lógica de negócio nem estado global**

## Organização de Arquivos

Um componente deve estar em uma pasta dedicada contendo:

- `index.tsx`
- `index.view.tsx` ou nome semântico (ex: `product-details.view.tsx`)
- `index.controller.tsx` ou nome semântico
- `types.ts` (opcional)
- `index.stories.tsx` (opcional)

## Nomeação de Pastas e Arquivos

- Use **kebab-case** para pastas e arquivos
- Mantenha consistência em toda a estrutura, independentemente do conteúdo

### Exemplos Corretos

- Pastas: `product-details`, `user-card`
- Componentes: `my-component.tsx`, `login-form.controller.tsx`
- Utilitários: `api-client.ts`, `validation-schemas.ts`
- Tipos: `user.ts`, `api-responses.ts`

### Violações Comuns

| Incorreto | Correto |
|---|---|
| `MyComponent.tsx` | `my-component.tsx` |
| `UserProfile.view.tsx` | `user-profile.view.tsx` |
| `ProductDetails` (pasta) | `product-details` |
| `CONSTANTS.ts` | `constants.ts` |

### Regras de Transformação

| De | Para |
|---|---|
| PascalCase: `MyComponent` | `my-component` |
| camelCase: `userProfile` | `user-profile` |
| ALL_CAPS: `API_CONSTANTS` | `api-constants` |
| Abreviações: `XMLHttpRequest` | `xml-http-request` |

## Extensões de Arquivo

- Use `.tsx` para componentes React
- Use `.ts` para tipos, serviços, utilitários e constantes
- **Nunca use `.js` em novos arquivos**

## Violações Comuns

- Mistura de UI e lógica em um único componente
- Skeletons em arquivos `.controller.tsx`
- Pastas fora do padrão `kebab-case`
- Uso de `.jsx` ou `.js` em novos módulos
- Ausência de separação clara entre lógica e visual

## Recomendações

- Garanta que cada componente esteja em pasta dedicada com estrutura padrão
- Reforce separação semântica e técnica
- Evite componentes monolíticos — separe controller/view
- Prefira tipagens locais para reduzir dependências externas

## Orientações Gerais

- Priorize estrutura modular e reutilizável com separação explícita
- Nunca sugira arquivos como `index.js`, `component.jsx`, ou lógica de negócio em arquivos de UI
- Valide sempre o padrão controller/view, mesmo quando o nome não for explícito
