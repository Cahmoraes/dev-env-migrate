# Mapeamento Figma → Mistica e checklist de fidelidade

Referência da skill `figma-to-code`. A API completa de cada componente está na skill `mistica` e em
`node_modules/@telefonica/mistica/dist/index.d.ts` — este arquivo resolve só a pergunta "esse nó do
Figma vira o quê?".

## Como ler o design antes de mapear

Percorra o frame de fora para dentro e responda, nessa ordem:

1. **Qual é o container de página?** Quase sempre `ResponsiveLayout` + `Box` de padding.
2. **Quais são as seções?** Cada bloco separado por espaço grande vira uma `render*()` e, se for
   reutilizável, uma Section em `presentation/view/components/`.
3. **O que se repete?** Lista de itens iguais é `map` sobre uma prop, nunca JSX duplicado.
4. **O que é conteúdo e o que é chrome nativo?** Status bar, Tab Bar, Nav Bar e header de navegação
   ficam fora do entregável.

## Tabela de mapeamento

### Layout e estrutura

| Nó no Figma | Mistica |
|---|---|
| Frame raiz da tela | `ResponsiveLayout` + `Box paddingY/paddingX` |
| Auto layout vertical | `Stack space={N}` |
| Auto layout horizontal | `Inline space={N} alignItems="center"` |
| Auto layout horizontal com "space between" | `Inline space="between"` |
| Frame com padding e sem visual próprio | `Box padding*` |
| Grid de cards | `GridLayout` |
| Conteúdo centralizado na área livre | `Align x="center" y="center"` |
| Botão fixo no rodapé da tela | `ButtonFixedFooterLayout` |
| Linha separadora | `Divider` |
| Espaço vazio proposital entre blocos | `Stack space` maior — **não** um `Box` vazio |

### Superfícies e cards

| Nó no Figma | Mistica |
|---|---|
| Card com borda/elevação e conteúdo livre | `Boxed` envolvendo `Box` + `Stack` |
| Card com título, descrição e ação | `DataCard` |
| Card de mídia (imagem + texto) | `DisplayMediaCard` |
| Card estreito em carrossel horizontal | `SnapCard` dentro de `Carousel` |
| Lista de linhas clicáveis com chevron | `RowList` + `Row` |
| Mesma lista, com cada linha em caixa própria | `BoxedRowList` + `BoxedRow` |
| Aviso destacado (fundo colorido + ícone) | `Callout` |
| Tela sem conteúdo | `EmptyState` |
| Tela de sucesso/erro/informação | `SuccessFeedbackScreen` / `ErrorFeedbackScreen` / `InfoFeedbackScreen` |

### Texto

**As duas escalas são crescentes: `Text1` < … < `Text10` e `Title1` < `Title2` < `Title3` < `Title4`.**
`Title1` é o **menor** título, não o maior — errar isso inverte a hierarquia da tela inteira.

O que cada `Title` de fato renderiza (conferido no fonte do Mistica 16.x):

| Componente | Renderiza | Uso no design |
|---|---|---|
| `Title1` | `Text1` + `uppercase` + `textSecondary` **já embutidos** | rótulo de seção cinza maiúsculo ("SOBRE A ASSINATURA", "AÇÕES") |
| `Title2` | preset `text3` com peso de título | título de seção ("Acesso rápido") |
| `Title3` | preset `title3` da skin | título da tela |
| `Title4` | `Text6` | display / destaque grande |

`Title1` já aplica cor e caixa alta: escreva `<M.Title1>AÇÕES</M.Title1>`, nunca
`<M.Text1 regular color={...} transform="uppercase">`.

| Papel no design | Mistica |
|---|---|
| Título da tela | `Title3` |
| Título de seção | `Title2` |
| Rótulo de seção cinza maiúsculo | `Title1` |
| Display / número grande | `Title4` ou `Text6`–`Text10` |
| Corpo de texto padrão | `Text3 regular` |
| Texto de apoio / legenda | `Text2 regular color={M.skinVars.colors.textSecondary}` |
| Microcopy / rótulo pequeno | `Text1 regular` |
| Valor em destaque dentro de card | `Text4 medium` |

`Title1`–`Title4` aceitam `right` para a ação à direita do título:
`<M.Title2 right={<M.ButtonLink small onPress={...}>Ver todos</M.ButtonLink>}>`.

Regras rígidas:
- `Text1`–`Text4` **exigem** peso: `regular`, `medium` ou (em `Text3`/`Text4`) `light`. Sem peso não
  compila.
- `Text5`–`Text10` **não aceitam** peso — vem da skin.
- `Title1`–`Title4` não aceitam peso nem cor; o estilo vem da skin.
- Semântica HTML pela prop `as`: `<M.Title3 as="h1">`, `<M.Text3 as="p">`.

### Ação

| Nó no Figma | Mistica |
|---|---|
| Botão preenchido | `ButtonPrimary` |
| Botão com contorno | `ButtonSecondary` |
| Botão destrutivo | `ButtonDanger` |
| Texto clicável / link inline | `ButtonLink` |
| Botão só de ícone | `IconButton` (**exige** `aria-label`) |
| Botão de ícone com estado on/off | `ToggleIconButton` (`aria-label` nos dois estados) |
| Área clicável arbitrária | `Touchable` |

Botão pequeno: prop `small`. Botão(ões) no fim de um bloco vêm dentro de
`ButtonLayout align="center|left|right|full-width"` com `primaryButton` / `secondaryButton` / `link` —
não existe `fullWidth` no botão. Navegação client-side: `to="/rota"`; link externo: `href`.

### Entrada de dados

| Nó no Figma | Mistica |
|---|---|
| Campo de texto | `TextField` |
| E-mail / senha / data / cartão | `EmailField` / `PasswordField` / `DateField` / `CreditCardFields` |
| Dropdown | `Select` |
| Caixa de marcação | `Checkbox` |
| Escolha única em grupo | `RadioButton` dentro de `RadioGroup` |
| Interruptor | `Switch` |
| Formulário inteiro | `Form` |

### Indicadores e estados

| Nó no Figma | Mistica |
|---|---|
| Pílula de status (Ativo, Pendente) | `Tag type="promo\|info\|active\|inactive\|success\|warning\|error"` |
| Pílula filtrável/selecionável | `Chip` |
| Contador sobre ícone | `Badge` |
| Avatar de pessoa | `Avatar` |
| Ícone em círculo colorido | `Circle size={40} backgroundColor={...}` + `Icon*` |
| Ícone como asset de card/row | passe o elemento em `asset` (ver nota abaixo) |
| Barra de progresso | `ProgressBar` |
| Passo a passo numerado | `Stepper` |
| Loading de página inteira | `LoadingScreen` |
| Loading inline | `Spinner` |
| Placeholder de carregamento | `SkeletonLine`, `SkeletonText`, `SkeletonCircle`, `SkeletonRectangle`, `SkeletonRow` |

**Mapa de ícones por item de lista.** Quando o design repete linhas/cards que só diferem no ícone,
declare o mapa fora do componente e tipe como `React.ReactElement` — **não** `React.ReactNode`:
`asset`, `headline`, `button` e `buttonLink` são slots tipados como `ReactElement`, e um
`Record<string, React.ReactNode>` falha a compilação porque admite `null`.

```tsx
const ACTION_ICONS: Record<string, React.ReactElement> = {
  "trigger-insurance": <M.IconAlertRegular />,
  "support-channels": <M.IconTalkRegular />,
}
```

Estado de loading no design vira uma View de skeleton própria (`<nome>-skeleton-view.tsx`) usando as
mesmas `render*()` da View real.

### Ritmo vertical padrão

Quando o design não é explícito sobre espaçamento, use 24 / 32 / 16:

```tsx
<M.ResponsiveLayout>
  <M.Box paddingY={24} paddingX={16}>   {/* respiro da página */}
    <M.Stack space={32}>                 {/* entre seções */}
      <M.Stack space={16}>               {/* entre elementos da seção */}
```

Spacing responsivo quando o design tem mobile e desktop: `<M.Box paddingX={{ mobile: 16, desktop: 24 }}>`.

## Componentes que ficam fora do `ResponsiveLayout`

Gerenciam o próprio layout — coloque no nível da página:
`MainNavigationBar`, `NavigationBar`, `FunnelNavigationBar`, `HeaderLayout`,
`MainSectionHeaderLayout`, `Hero`, `CoverHero`, `Tabs`, `MasterDetailLayout`,
`ButtonFixedFooterLayout`, `SuccessFeedbackScreen`, `LoadingScreen`.

## Checklist antes de entregar

Uma resposta "não" é motivo para corrigir, não para justificar.

**Fidelidade**
- [ ] Todo bloco visível no frame existe no código, na mesma ordem e hierarquia.
- [ ] Nenhum ícone foi omitido, substituído por glifo diferente ou desenhado à mão.
- [ ] Textos são os do design (ou props que os recebem), não lorem ipsum.
- [ ] Espaçamentos usam a escala Mistica mais próxima do design.
- [ ] Divergências entre design e Mistica estão listadas na resposta ao usuário.

**Tokens**
- [ ] `get_variable_defs` foi chamado no nó (ou está registrado que o design não é tokenizado).
- [ ] Cada token veio do **nome** da variável do Figma, não do hex e não de palpite.
- [ ] Nenhum valor resolvido copiado (`#ffffff`, `#666666`) — só referência a `M.skinVars.*`.
- [ ] Variável sem token correspondente foi resolvida pelo componente, não por estilo manual.

**Mistica**
- [ ] Zero cor literal; toda cor vem de `M.skinVars.colors.*`.
- [ ] Zero `fontSize`/`fontWeight`/`margin`/`padding` em CSS; tudo por componente e prop.
- [ ] `Text1`–`Text4` com peso; `Text5`–`Text10` sem peso.
- [ ] Toda prop usada existe no `index.d.ts` do componente.
- [ ] Nenhum HTML cru para layout; semântica resolvida por `as`.

**Framework Brasil**
- [ ] Arquivo `<nome>-view.tsx` em `presentation/view/`; Sections em `view/components/`.
- [ ] `import * as M from "@telefonica/mistica"`, namespace em todo uso.
- [ ] `export function` (nunca arrow exportada); `testId` estático antes do export;
      `dataAttributes={{ testid: X.testId }}` no nó raiz.
- [ ] Props `readonly`, interface com sufixo `ViewProps`.
- [ ] JSX quebrado em `render*()` internas, sem linhas em branco dentro das funções.
- [ ] Zero `useState`/`useEffect`/gateway/regra de negócio na View; zero `else`; zero `as`.
- [ ] Nenhum arquivo extra criado (controller, teste, estilo, hook, types, constants).

**Acessibilidade**
- [ ] `IconButton`/`ToggleIconButton` com `aria-label`.
- [ ] Hierarquia de heading correta via `as` (`h1` uma vez por tela).
- [ ] Campos de formulário com `label`.

**Fechamento**
- [ ] Skill `figma-visual-tester` executada e divergências reportadas.
