# Tokens de Design — Mistica

> Fonte: https://github.com/Telefonica/mistica-web/blob/master/doc/design-tokens.md

Todos os tokens são acessados via objeto `skinVars` exportado de `@telefonica/mistica`. Tokens se adaptam
automaticamente ao skin ativo e ao color scheme (light/dark mode).

## Regras Críticas de Tokens

- **NUNCA hardcode cores** — sempre `skinVars.colors.*` para todos os valores de cor
- Use `skinVars.rawColors.*` (não `skinVars.colors.*`) ao aplicar alpha com `applyAlpha`
- Use `skinVars.borderRadii.*` para valores de border radius
- Tokens são CSS custom properties em runtime — funcionam tanto em inline styles quanto em CSS

## Cores

### Usando Cores em Código

```tsx
import {skinVars, Text2, Box} from '@telefonica/mistica';

// Em inline styles
<div style={{color: skinVars.colors.textPrimary, backgroundColor: skinVars.colors.backgroundContainer}}>
  Conteúdo
</div>

// Em props de cor dos componentes (preferido)
<Text2 regular color={skinVars.colors.textSecondary}>Texto secundário</Text2>

// Prefira componentes Mistica em vez de divs com estilos
<Box padding={16}>
  <Text2 regular color={skinVars.colors.textSecondary}>Texto</Text2>
</Box>
```

### Principais Tokens de Cor

```tsx
// Texto
skinVars.colors.textPrimary           // Texto principal
skinVars.colors.textSecondary         // Texto secundário
skinVars.colors.textPrimaryInverse    // Texto sobre fundo escuro
skinVars.colors.textSecondaryInverse  // Texto secundário sobre fundo escuro
skinVars.colors.textLink              // Texto de link
skinVars.colors.textLinkInverse       // Link sobre fundo escuro

// Background
skinVars.colors.background            // Fundo principal da página
skinVars.colors.backgroundAlternative // Fundo alternativo
skinVars.colors.backgroundContainer   // Fundo de cards/containers
skinVars.colors.backgroundBrand       // Fundo brand

// Brand
skinVars.colors.brand                 // Cor primária da marca
skinVars.colors.brandLow              // Cor brand atenuada (para assets/circles)
skinVars.colors.brandHigh             // Cor brand intensificada

// Status
skinVars.colors.success               // Verde de sucesso
skinVars.colors.successLow            // Verde de sucesso atenuado
skinVars.colors.error                 // Vermelho de erro
skinVars.colors.errorLow              // Vermelho atenuado
skinVars.colors.warning               // Amarelo de aviso
skinVars.colors.warningLow            // Amarelo atenuado
skinVars.colors.promo                 // Cor promocional
skinVars.colors.promoLow              // Cor promocional atenuada

// Bordas
skinVars.colors.border                // Borda padrão
skinVars.colors.borderLow             // Borda sutil
skinVars.colors.borderHigh            // Borda pronunciada

// Neutros
skinVars.colors.neutralHigh           // Neutro escuro
skinVars.colors.neutralMedium         // Neutro médio
skinVars.colors.neutralLow            // Neutro claro
skinVars.colors.neutralExtraLow       // Neutro muito claro
```

### Aplicando Alpha (Transparência)

```tsx
import {applyAlpha, skinVars} from '@telefonica/mistica';

// CORRETO: use rawColors com applyAlpha
const semitransparente = applyAlpha(skinVars.rawColors.backgroundBrand, 0.5);
const overlay = applyAlpha(skinVars.rawColors.neutralHigh, 0.8);

// ERRADO: skinVars.colors contém referências CSS var(), não valores RGB
// applyAlpha(skinVars.colors.brand, 0.5) — NÃO FAÇA ISSO
```

## Border Radius

```tsx
// Use em estilos customizados (fortemente prefira usar componentes Mistica)
skinVars.borderRadii.container   // Radius de containers/cards
skinVars.borderRadii.button      // Radius de botões
skinVars.borderRadii.input       // Radius de campos de input
skinVars.borderRadii.popup       // Radius de popups/dialogs
skinVars.borderRadii.chip        // Radius de chips
skinVars.borderRadii.sheet       // Radius de sheets
skinVars.borderRadii.avatar      // Radius de avatars
skinVars.borderRadii.tag         // Radius de tags

// Exemplo de uso
<div style={{borderRadius: skinVars.borderRadii.container}}>...</div>
```

## Spacing Tokens

Tokens de spacing são expostos via `skinVars.spacing.*`. Principalmente úteis para skin authoring e modificar
spacing de componentes de layout como `Box`, `Stack`, `Inline`, `ResponsiveLayout` e `GridLayout`.

```tsx
// Use apenas quando precisar de acesso direto ao token (ex: skin authoring)
skinVars.spacing.cardDefaultPadding.top
skinVars.spacing.cardDefaultPadding.right
skinVars.spacing.cardDefaultPadding.bottom
skinVars.spacing.cardDefaultPadding.left
```

**Para uso cotidiano, prefira sempre os valores diretos nos componentes:**
```tsx
<Stack space={16}>...</Stack>     // 16px entre filhos
<Box paddingX={24}>...</Box>      // 24px horizontal
<Box paddingY={16}>...</Box>      // 16px vertical
```

Valores padrão de spacing: `4`, `8`, `12`, `16`, `24`, `32`, `40`, `48`

## Presets de Tipografia

O tamanho de texto é gerenciado pelos componentes de texto. **Nunca defina font-size manualmente**.

| Componente | Opções de Weight | Uso |
|---|---|---|
| `Text1`–`Text4` | `light`, `regular`, `medium`, `bold` | Corpo de texto com weight configurável |
| `Text5`–`Text10` | Fixo por skin | Texto de display/headline |
| `Title4` | Weight padrão do skin | Título de seção |
| `Title3` | Weight padrão do skin | Título de subseção |
| `Title2` | Weight padrão do skin | Título de card/pequeno |
| `Title1` | Weight padrão do skin | Menor título |

## ThemeVariant (Contextos de Variante)

Algumas seções da página usam contextos de cor diferentes. Use prop `variant` em `ResponsiveLayout` ou `Boxed`:

```tsx
// Seção brand (fundo colorido)
<ResponsiveLayout variant="brand">
  <Box paddingY={24}>
    <Text2 regular>O texto adapta as cores automaticamente</Text2>
    <ButtonPrimary onPress={() => {}}>Ação</ButtonPrimary>
  </Box>
</ResponsiveLayout>

// Seção alternativa
<ResponsiveLayout variant="alternative">
  <Box paddingY={24}>
    <Text2 regular>Seção com fundo alternativo</Text2>
  </Box>
</ResponsiveLayout>
```

Variantes disponíveis:
- `'default'` — fundo branco
- `'brand'` — fundo da cor brand
- `'negative'` — fundo escuro (texto deve ser branco)
- `'alternative'` — fundo neutro claro
- `'media'` — para conteúdo sobre imagens ou vídeos

**Componentes dentro de uma seção de variante adaptam suas cores automaticamente.** Não é necessário definir
cores inversas manualmente.

## Configuração do Theme

```tsx
import {ThemeContextProvider, getMovistarNewSkin, getVivoNewSkin} from '@telefonica/mistica';
import '@telefonica/mistica/css/mistica.css';

const misticaTheme = {
  skin: getMovistarNewSkin(), // ou getVivoNewSkin(), getO2NewSkin(), etc.
  i18n: {locale: 'pt-BR', phoneNumberFormattingRegionCode: 'BR'},
  colorScheme: 'auto', // 'light' | 'dark' | 'auto'
};

<ThemeContextProvider theme={misticaTheme}>
  <SeuApp />
</ThemeContextProvider>
```

Skins disponíveis: `getMovistarNewSkin()`, `getVivoNewSkin()`, `getO2NewSkin()`, `getTelefonicaSkin()`,
`getBlauSkin()`, `getTuSkin()`, ou via `getSkinByName()`.
