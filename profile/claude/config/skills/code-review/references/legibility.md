# Legibilidade, Boas Práticas e Documentação

> Referência para a skill `code-review`.
> Diretrizes de legibilidade, nomeação, organização, tratamento de erros e boas práticas de código.

## Nomeação e Intenção

**Categoria: NÃO BLOQUEANTE**

- Variáveis, funções e classes devem ter nomes descritivos e consistentes
- Utilize conceitos de Domain-Driven Design
- Nomes de funções com efeitos colaterais devem refletir esse comportamento
- Evite nomes genéricos ou ambíguos como `x`, `tempVar`, `handleData`

## Código Autoexplicativo

**Categoria: RECOMENDADO**

- Prefira código que dispense comentários
- Comentários explicando "o que" indica código pouco claro — refatore
- Extraia condicionais com regras de negócio para funções nomeadas semanticamente

## Organização e Estrutura

**Categoria: NÃO BLOQUEANTE**

- Limite a profundidade de aninhamento a no máximo dois níveis
- Linhas devem ser legíveis (< 80 caracteres sempre que possível)
- Funções devem respeitar o SRP (Single Responsibility Principle)
- Separe blocos JSX complexos em componentes nomeados

## Tratamento de Erros

**Categoria: NÃO BLOQUEANTE**

- Utilize `try/catch` em funções assíncronas
- Evite `.then` encadeado — prefira async/await

## Design e Arquitetura

**Categoria: RECOMENDADO**

- Aplique SOLID, DRY, Clean Code
- Evite acoplamentos fortes e `if/else` desnecessários
- Prefira early returns e funções auxiliares

## React e TypeScript

**Categoria: NÃO BLOQUEANTE**

- Não acople tipagens React diretamente em props
- Encapsule `setState` com `useCallback` e nomes semânticos
- Configure `ref` usando `.current`

## Expressões Regulares

**Categoria: RECOMENDADO**

- Extraia expressões regulares para funções nomeadas
- Evite regex inline, especialmente em lógica de negócio

## Tipagens e Estrutura

**Categoria: NÃO BLOQUEANTE**

- Garanta tipagem em funções, parâmetros e props
- Extraia tipagens para interfaces reutilizáveis

## Comentários do Stryker

**Categoria: NÃO BLOQUEANTE**

- Evite desativar regras do Stryker Mutator sem justificativa clara

## Outros Itens Importantes

**Categoria: RECOMENDADO**

- Remova variáveis e imports não utilizados
- Elimine duplicações e incentive reutilização

## Violações Comuns

- Nomes genéricos ou não semânticos
- Código excessivamente aninhado ou confuso
- Falta de tratamento de erros com `try/catch`
- Comentários explicando o "quê" em vez do "porquê"
- Violação do SRP
- Expressões regulares inline ou duplicadas
- Tipagens mal definidas ou ausentes
- Nomes que não refletem efeitos colaterais
- Estruturas condicionais simplificáveis
- Duplicação de lógica e dependências desnecessárias

## Recomendações

- Sugira nomes claros para funções com efeitos colaterais
- Extraia funções reutilizáveis
- Recomende componentização de JSX extenso ou repetitivo
- Sugira uso de early returns ou composição funcional
- Indique melhorias estruturais para reforçar legibilidade
