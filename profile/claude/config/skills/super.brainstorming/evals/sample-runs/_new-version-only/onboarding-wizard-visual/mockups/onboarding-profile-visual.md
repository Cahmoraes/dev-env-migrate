# Mockup curado — Passo 2: Profile

*Norte direcional.* Tela aprovada: formulário de perfil (nome + avatar opcional).

**Fonte de design original:** nenhuma; norte "estilo Stripe" via companion.

## Prosa

Heading `<h1>` "Seu perfil". Campos: nome completo (obrigatório), avatar (upload opcional).
Validação on-blur + on-submit (D1). "Voltar" retorna ao Passo 1 preservando o que já foi
digitado (D2). Mesmos estados loading/erro/vazio de passo (D4). Coluna única; mobile empilha.

## Core JSX (snippet direcional)

```jsx
function ProfileStep({ values, errors, onBlurValidate }) {
  return (
    <form noValidate>
      {errors.summary && <div role="alert" tabIndex={-1}>{errors.summary}</div>}
      <Field label="Nome completo" name="fullName" value={values.fullName}
             onBlur={() => onBlurValidate('fullName')} error={errors.fullName} />
      <AvatarUpload name="avatar" value={values.avatar} optional />
    </form>
  );
}
```

## Design tokens aplicados

- Erro `--danger-500`; grid `8px`; avatar preview com radius `--radius-md`.
