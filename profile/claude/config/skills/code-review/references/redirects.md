# Redirecionamentos — Diretrizes de Code Review

> Referência para a skill `code-review`.
> Diretrizes para uso correto de redirecionamentos na aplicação.

## Categoria

**BLOQUEANTE**

## Critérios

- Em componentes como `ErrorAreaController`, `FeedbackError`, `FeedbackFailure`, verifique como o redirecionamento é feito
- O redirecionamento deve utilizar a função `replace` obtida via hook `useNavigation()`:

```tsx
import { useNavigation } from '@hooks/use-navigation';
```

- Se estiver usando `redirect`, oriente a substituição por `replace`
- Isso deve ser feito apenas para componentes onde a semântica exige que o `replace` da API `window.location.replace` seja utilizado:
  - Telas de final de fluxo, onde a opção de voltar para a tela anterior prejudica a experiência
  - Componentes/telas que não possuem necessidade de impedir o redirect (ex: `NotLoggedView`) podem usar `redirect`

## Justificativa

A função `replace` utiliza internamente `window.location.replace`, removendo a tela de erro da pilha do navegador. Isso evita que o usuário retorne à página de erro ao usar o botão "voltar".

## Violações Comuns

- Uso de `redirect` em telas de erro ou final de fluxo
- Redirecionamento sem `useNavigation()` hook
- Uso direto de `window.location.href` em vez de `replace`
