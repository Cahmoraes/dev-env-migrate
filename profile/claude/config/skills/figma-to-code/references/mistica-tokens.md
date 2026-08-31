# Tokens e Padrões Mistica

> Referência para a skill `mistica-figma-layout`.
> Define os tokens oficiais do Mistica e como usá-los corretamente.

## Cores

Use **sempre** tokens de cor do Mistica via `vars.colors.*`:

### Cores Principais

```tsx
import { vars } from '@telefonica/mistica';

// Texto
vars.colors.textPrimary      // Texto principal
vars.colors.textSecondary    // Texto secundário
vars.colors.textPrimaryInverse // Texto sobre fundo escuro

// Background
vars.colors.background       // Fundo principal
vars.colors.backgroundAlternative // Fundo alternativo
vars.colors.backgroundContainer // Fundo de containers

// Brand
vars.colors.brand            // Cor primária da marca
vars.colors.brandLow         // Cor primária atenuada
vars.colors.brandHigh        // Cor primária intensificada

// Status
vars.colors.success          // Verde de sucesso
vars.colors.error            // Vermelho de erro
vars.colors.warning          // Amarelo de aviso
vars.colors.promo            // Cor promocional

// Bordas
vars.colors.border           // Borda padrão
vars.colors.borderLow        // Borda sutil
```

### ❌ Nunca Use

```tsx
// ERRADO
color="#FF0000"
backgroundColor="red"
color="rgb(255, 0, 0)"
```

### ✅ Sempre Use

```tsx
// CORRETO
<Text2 color={vars.colors.textSecondary}>...</Text2>
<Box style={{ backgroundColor: vars.colors.backgroundContainer }}>...</Box>
```

## Spacing

Use valores padrão do Mistica em componentes de layout:

### Stack (espaçamento vertical)

```tsx
<Stack space={4}>   // 4px
<Stack space={8}>   // 8px
<Stack space={12}>  // 12px
<Stack space={16}>  // 16px (padrão comum)
<Stack space={24}>  // 24px
<Stack space={32}>  // 32px
<Stack space={40}>  // 40px
```

### Inline (espaçamento horizontal)

```tsx
<Inline space={4}>   // 4px
<Inline space={8}>   // 8px (padrão comum para ícone + texto)
<Inline space={12}>  // 12px
<Inline space={16}>  // 16px
```

### Box (padding)

```tsx
<Box padding={16}>         // Todos os lados
<Box paddingX={24}>        // Horizontal (left + right)
<Box paddingY={16}>        // Vertical (top + bottom)
<Box paddingTop={8}>       // Apenas top
<Box paddingBottom={16}>   // Apenas bottom
<Box paddingLeft={24}>     // Apenas left
<Box paddingRight={24}>    // Apenas right
```

### ❌ Evite

```tsx
// NÃO RECOMENDADO
<div style={{ margin: '10px' }}>
<Box padding={7}>  // Valor não-padrão
```

## Tipografia

### Componentes de Texto

```tsx
// Hierarquia de texto
<Text1>   // Maior
<Text2>   // Padrão (mais comum)
<Text3>   // Menor

// Títulos
<Title1>  // Título principal
<Title2>  // Subtítulo
<Title3>  // Título terciário

// Headings
<Heading1>  // H1
<Heading2>  // H2
...
<Heading6>  // H6
```

### Weight (peso)

**IMPORTANTE**: Text1, Text2 e Text3 devem ter a propriedade `weight` definida:

```tsx
<Text2 regular>Texto regular</Text2>
<Text2 medium>Texto médio (semi-bold)</Text2>
<Text2 light>Texto leve</Text2>

// ❌ ERRADO (sem weight)
<Text2>Texto sem peso definido</Text2>
```

### Exemplo Completo

```tsx
<Stack space={8}>
  <Title1>Título Principal</Title1>
  <Text2 regular color={vars.colors.textSecondary}>
    Descrição em texto secundário
  </Text2>
  <Text3 medium color={vars.colors.textPrimary}>
    Detalhe importante
  </Text3>
</Stack>
```

## Border Radius

Quando necessário, use valores padrão:

```tsx
vars.borderRadii.container   // Radius de containers
vars.borderRadii.button      // Radius de botões
vars.borderRadii.input       // Radius de inputs
```

## Shadows

Para sombras (quando suportado):

```tsx
vars.shadows.shadow1         // Sombra leve
vars.shadows.shadow2         // Sombra média
vars.shadows.shadow3         // Sombra pronunciada
```

## Validação de Tokens

Antes de usar qualquer valor literal:

1. **Pergunte**: "Este valor tem um token Mistica correspondente?"
2. **Consulte**: Arquivo de tipos ou documentação
3. **Use o token**: Sempre prefira o token ao valor literal
4. **Documente**: Se não existir token, justifique no código

## Checklist de Tokens

Antes de entregar a implementação:

- [ ] Todas as cores usam `vars.colors.*`?
- [ ] Spacing usa valores padrão (4, 8, 12, 16, 24, 32, 40)?
- [ ] Componentes de texto têm `weight` definido?
- [ ] Nenhum valor literal de cor (#hex, rgb, nome)?
- [ ] Nenhum margin/padding customizado em pixels?
- [ ] Border radius usa tokens quando aplicável?
