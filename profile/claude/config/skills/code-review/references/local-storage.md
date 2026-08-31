# Armazenamento Local — Diretrizes de Code Review

> Referência para a skill `code-review`.
> Diretrizes para uso correto de localStorage e sessionStorage.

## Uso Apropriado

- Utilize localStorage apenas quando houver necessidade de persistência entre sessões
- Considere sessionStorage para dados temporários limitados à sessão
- Armazene apenas informações simples, temporárias e relacionadas à interface

## Limpeza de Dados

**Categoria: BLOQUEANTE**

- Após recuperar os dados, remova a chave imediatamente se não houver reutilização
- Evite manter informações desnecessárias no armazenamento

## Estrutura de Armazenamento

**Categoria: BLOQUEANTE**

- Serialize os dados como objetos JSON ou arrays
- Não armazene strings complexas ou sem estrutura definida

## Nomenclatura de Chaves

**Categoria: BLOQUEANTE**

- Use um padrão consistente, como: `@nome_da_jornada`
- Evite nomes genéricos ou duplicados entre jornadas distintas

## Validação de Dados

**Categoria: BLOQUEANTE**

- Valide a estrutura e conteúdo antes de utilizar valores recuperados
- Nunca envie dados diretamente do localStorage para o BFF sem validação explícita

## Comportamento Esperado

**Categoria: RECOMENDADO**

- Geração de código com uso intencional e controlado de localStorage
- Garantia de limpeza após uso
- Tipagem segura e validação prévia ao acoplamento com back-end
