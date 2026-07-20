# Mockup curado — Passo 3: Preferences

*Norte direcional.* Tela aprovada: preferências (notificações + tema) e conclusão.

**Fonte de design original:** nenhuma; norte "estilo Stripe" via companion.

## Prosa

Heading `<h1>` "Preferências". Toggles: notificações por email, tema (claro/escuro).
Sem campos obrigatórios → on-submit valida só consistência; CTA final é "Concluir"
(`aria-busy` no submit — D4 loading). "Voltar" preserva entrada (D2). Coluna única; mobile
empilha os toggles e CTAs full-width.

## Core JSX (snippet direcional)

```jsx
function PreferencesStep({ values, onToggle }) {
  return (
    <form noValidate>
      <Toggle label="Receber notificações por email"
              checked={values.emailNotifications}
              onChange={() => onToggle('emailNotifications')} />
      <SegmentedControl label="Tema" options={['Claro', 'Escuro']}
                        value={values.theme} onChange={(t) => onToggle('theme', t)} />
    </form>
  );
}
```

## Design tokens aplicados

- Toggle ativo `--brand-500`; grid `8px`; radius `--radius-md`.
