# Mockup curado — Passo 1: Account

*Norte direcional.* Tela aprovada: formulário de conta (email + senha).

**Fonte de design original:** nenhuma; norte "estilo Stripe" via companion.

## Prosa

Heading `<h1>` "Crie sua conta". Campos: email, senha. Cada campo valida **on-blur** (D1);
mensagem de erro sob o campo em `--danger-500`. Ao clicar "Continuar", revalida tudo; se
inválido, um resumo `role="alert"` no topo recebe foco (D6). Estado *vazio* = placeholders;
*loading* = "Continuar" `aria-busy` durante submit. Coluna única; no mobile os campos e CTAs
ocupam largura total.

## Core JSX (snippet direcional)

```jsx
function AccountStep({ values, errors, onBlurValidate }) {
  return (
    <form noValidate>
      {errors.summary && <div role="alert" tabIndex={-1}>{errors.summary}</div>}
      <Field label="Email" name="email" type="email"
             value={values.email} onBlur={() => onBlurValidate('email')}
             error={errors.email} />         {/* erro on-blur, D1 */}
      <Field label="Senha" name="password" type="password"
             value={values.password} onBlur={() => onBlurValidate('password')}
             error={errors.password} />
    </form>
  );
}
```

## Design tokens aplicados

- Erro de campo: `--danger-500`, `8px` de espaço campo↔erro.
- Tipografia do design system; inputs com radius `--radius-md`.
