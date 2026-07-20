# Mockup curado — Casca do Onboarding Wizard (shell)

*Norte direcional, não pixel-final.* Tela aprovada: a casca que envolve os 3 passos —
stepper, progresso, navegação back/next, banner de retomada e estados de nível-casca.

**Fonte de design original:** nenhuma; norte "estilo Stripe onboarding" via companion.

## Prosa

Coluna única centralizada (máx `640px`). Topo: stepper horizontal com 3 nós (Account /
Profile / Preferences), o atual com `aria-current="step"` e a barra de progresso preenchida
até o passo. Abaixo, a área do passo (children). Rodapé de navegação: "Voltar" (secundário,
esquerda) e "Continuar" (primário, direita). Quando há progresso salvo, um banner dismissível
"Retomamos de onde você parou" aparece acima do stepper.

Estados de casca: **loading** = skeleton do stepper + bloco do passo enquanto restaura o
`sessionStorage`; **erro de restauração** = banner `role="alert"` não-bloqueante + começa
limpo no Passo 1; **vazio** (primeira visita) = Passo 1 direto, sem banner.

A cada troca de passo o foco vai para o `<h1>` do passo (D6). `< 768px`: stepper colapsa
para "Passo N de 3" + barra; CTAs empilham full-width.

## Core JSX (snippet direcional)

```jsx
function OnboardingWizard({ step, totalSteps, resumed, status }) {
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, [step]); // D6: foco no heading

  if (status === 'loading') return <WizardSkeleton />;        // D4 casca-loading

  return (
    <main className="wizard" style={{ maxWidth: 640 }}>
      {status === 'restore-error' && (
        <div role="alert" className="banner banner--error">
          Não foi possível retomar; começando do início.
        </div>
      )}
      {resumed && status === 'ok' && (
        <ResumeBanner dismissible>Retomamos de onde você parou.</ResumeBanner>
      )}
      <Stepper current={step} total={totalSteps} aria-label="Progresso do onboarding" />
      <section className="wizard__step">
        <h1 ref={headingRef} tabIndex={-1}>{STEP_TITLES[step]}</h1>
        {/* AccountStep | ProfileStep | PreferencesStep */}
      </section>
      <nav className="wizard__nav">
        <button className="btn btn--secondary" disabled={step === 0}>Voltar</button>
        <button className="btn btn--primary" aria-busy={status === 'submitting'}>
          {step === totalSteps - 1 ? 'Concluir' : 'Continuar'}
        </button>
      </nav>
    </main>
  );
}
```

## Design tokens aplicados

- Cor: primária `--brand-500` (CTA), erro `--danger-500` (banner/alert).
- Layout: largura máx `640px`; grid de `8px`; card radius `--radius-md`.
- Breakpoint mobile: `768px` (stepper colapsa; CTAs full-width empilhados).
