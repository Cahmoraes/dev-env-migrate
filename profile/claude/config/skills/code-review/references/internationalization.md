# Internacionalização / Tradução (i18n)

> Referência para a skill `code-review`.
> Define as regras de internacionalização e padrões de chaves de tradução.

## Categoria

**BLOQUEANTE**

## Critérios

Todas as chaves de tradução devem:

1. Estar em **minúsculas**
2. Podem ser encadeadas com ponto (`.`) para representar namespaces
3. Palavras compostas devem ser separadas por **underscore** (`_`)

## Exemplos

### Correto

```json
{
  "home.welcome_message": "Bem-vindo",
  "checkout.payment.card_number": "Número do cartão",
  "profile.edit_profile": "Editar perfil"
}
```

### Incorreto

```json
{
  "Home.WelcomeMessage": "Bem-vindo",
  "checkout.payment.cardNumber": "Número do cartão",
  "Profile.EditProfile": "Editar perfil"
}
```

## Correção

Ajuste todas as chaves para conformidade com os critérios estabelecidos:
- Converter PascalCase/camelCase para snake_case com separador de underscore
- Garantir que namespaces usem ponto como separador
- Todas as letras minúsculas

## Violações Comuns

- Chaves em camelCase ou PascalCase
- Uso de hífen em vez de underscore
- Namespaces com letras maiúsculas
- Chaves sem namespace (sem contexto de domínio)
