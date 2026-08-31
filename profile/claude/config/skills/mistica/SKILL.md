---
name: mistica
description: "Use SEMPRE que o usuário quiser: (1) criar ou implementar componentes, views, layouts ou telas React com Mistica Design System (Telefónica) sem design artifacts externos (sem Figma, sem imagem, sem mockup); (2) consultar docs, props, exemplos ou APIs de componentes do Mistica (ButtonPrimary, Stack, Inline, Box, TextField, Form, DataCard, RowList, Carousel, Skeleton, FeedbackScreen, NavigationBar, Tag, Chip, Avatar, Drawer, etc.); (3) perguntar sobre tokens (skinVars.colors, skinVars.borderRadii, skinVars.spacing), tipografia (Text1-10, Title1-4), ou padrões de layout; (4) qualquer task que mencione '@telefonica/mistica'. NÃO use quando o usuário fornecer link do Figma, imagem, screenshot ou mockup (use figma-to-code). Substitui mistica-docs-query em tarefas mistas."
---

# Mistica Design System

Você é especialista em **Mistica Web** da Telefónica — a biblioteca de componentes React usada para construir
todas as interfaces do projeto.

## Handoffs para Outras Skills

- **Figma / imagem / mockup fornecido?** → Use a skill `figma-to-code` em vez desta
- **Apenas consulta rápida de componente?** → Esta skill também resolve (ela substitui `mistica-docs-query`)

## Setup e Integração (Pré-requisitos)

```tsx
import '@telefonica/mistica/css/mistica.css';
import {ThemeContextProvider, getVivoNewSkin} from '@telefonica/mistica';

// theme deve ser constante ou memoizado
const theme = {
  skin: getVivoNewSkin(), // ou getMovistarNewSkin(), getO2NewSkin(), etc.
  i18n: {locale: 'pt-BR', phoneNumberFormattingRegionCode: 'BR'},
  colorScheme: 'auto', // 'light' | 'dark' | 'auto'
  Link: {type: 'ReactRouter6', Component: Link}, // necessário para usar prop "to"
};

<ThemeContextProvider theme={theme}>
  <SeuApp />
</ThemeContextProvider>
```

**Pontos de atenção críticos:**
- Sem `ThemeContextProvider` nenhum componente Mistica funciona
- Sem `@telefonica/mistica/css/mistica.css` os estilos não carregam
- A prop `to="/path"` em botões/rows/cards **requer** `theme.Link` configurado
- O font-family e background do body precisam ser definidos manualmente (Mistica não injeta automaticamente)

## Documentação Oficial

- **Repositório**: https://github.com/Telefonica/mistica-web
- **Diretório de docs**: `node_modules/@telefonica/mistica/doc/` (ou fallback no GitHub: `https://github.com/Telefonica/mistica-web/blob/master/doc/`)
- **Arquivo de tipos**: `node_modules/@telefonica/mistica/dist/index.d.ts`
- **Ferramenta MCP disponível**: `mistica-web-docs` (busca semântica na documentação oficial)

## Regras Críticas (NUNCA Viole)

1. **NUNCA use cores hardcodadas** — sempre `skinVars.colors.*` de `@telefonica/mistica`
2. **Prefira componentes Mistica a raw HTML** — use `Box`, `Stack`, `Inline`, `Text*`, `Title*` no lugar de
   `<div>`, `<span>`, `<p>`. Use raw HTML apenas quando a API do componente Mistica exigir (ex.: `as="p"`),
   quando for necessário para setup/estilos globais, ou quando não há primitiva Mistica equivalente
3. **NUNCA defina font-size manualmente** — use `Text1`–`Text10`, `Title1`–`Title4`
4. **NUNCA defina border-radius manualmente** — use `skinVars.borderRadii.*` ou componentes que já gerenciam isso
5. **NUNCA invente props** — valide sempre no arquivo de tipos ou na documentação antes de usar
6. **Prefira valores padrão de spacing**: 4, 8, 12, 16, 24, 32, 40, 48 — via `Stack space={N}`, `Box padding={N}`
7. **Import de componentes/hooks/tokens**: sempre de `@telefonica/mistica`; imports de setup como
   `@telefonica/mistica/css/mistica.css` são permitidos e necessários

## Import Pattern

```tsx
import * as M from '@telefonica/mistica';
```

## Modo de Operação

Esta skill opera em dois modos: **construção** e **consulta**.

### Modo Construção (o usuário quer criar algo)

Siga este workflow:

1. **Leia as refs base antes de qualquer código** — para tasks de construção geral:
   - `references/patterns.md` — regras de composição de página (SEMPRE)
   - `references/layout.md` — primitivas e page layouts (SEMPRE)
   - `references/components.md` — catálogo completo (quando necessário para o componente específico)
   - `references/forms.md` — formulários (quando há forms)
   - `references/tokens.md` — tokens (quando tokens específicos são necessários)
2. **Crie um plano** identificando os componentes Mistica necessários
3. **Implemente** seguindo as regras críticas e o formato de entrega
4. **Valide props e APIs**: antes de usar qualquer prop não-trivial, consulte o arquivo de tipos em
   `node_modules/@telefonica/mistica/dist/index.d.ts` ou use `mistica-web-docs` e `context-7`. As referencias desta skill
   são **resumos de trabalho** — a fonte de verdade é sempre a documentação oficial e o arquivo de tipos
5. **Aplique o checklist final**

### Modo Consulta (o usuário quer saber sobre um componente)

1. Use a tool **`mistica-web-docs`** para busca semântica na documentação oficial
2. Use a tool **`context-7`** para busca semântica na documentação oficial
2. Se necessário, valide props em `node_modules/@telefonica/mistica/dist/index.d.ts`
3. Forneça resposta estruturada com: descrição, import, exemplos de uso, props principais

## Referências desta Skill

Leia as referências abaixo conforme a necessidade da task. Para tasks de construção geral, leia
`patterns.md` e `layout.md` primeiro — eles contêm as regras fundamentais de composição de página.

| Arquivo                            | Quando Ler                                      |
| ---------------------------------- | ----------------------------------------------- |
| `references/patterns.md`           | **SEMPRE** para construção — regras e composição de página |
| `references/layout.md`             | **SEMPRE** para construção — primitivas de layout e page layouts |
| `references/components.md`         | Catálogo completo de componentes e suas APIs    |
| `references/tokens.md`             | Tokens de design: cores, radii, spacing         |
| `references/forms.md`              | Formulários, campos e hook useForm              |

## Ritmo Vertical (Vertical Rhythm)

Regra 24/32/16 — obrigatória em toda composição de página:

```tsx
<ResponsiveLayout>
  <Box paddingY={24}>           {/* 24px top/bottom no container */}
    <Stack space={32}>          {/* 32px entre seções */}
      <Stack space={16}>        {/* 16px entre elementos dentro de seção */}
        <Title1>Seção</Title1>
        <Text2 regular>Conteúdo</Text2>
      </Stack>
    </Stack>
  </Box>
</ResponsiveLayout>
```

## Primitivas de Layout (Quick Reference)

```tsx
{/* Espaçamento vertical */}
<Stack space={16}>
  <ComponenteA />
  <ComponenteB />
</Stack>

{/* Espaçamento horizontal */}
<Inline space={8} alignItems="center">
  <IconSearchRegular />
  <Text2 regular>Texto</Text2>
</Inline>

{/* Padding interno */}
<Box paddingX={24} paddingY={16}>
  <Text2 regular>Conteúdo</Text2>
</Box>

{/* Centralizar conteúdo */}
<Align x="center" y="center" height="100%">
  <Spinner size={24} />
</Align>

{/* Container responsivo */}
<ResponsiveLayout>
  <Box paddingY={24}>{/* página */}</Box>
</ResponsiveLayout>
```

## Componentes que NÃO Devem Ficar Dentro de ResponsiveLayout

Estes componentes gerenciam seu próprio layout interno — coloque-os diretamente no nível de página:

`MainNavigationBar`, `NavigationBar`, `FunnelNavigationBar`, `HeaderLayout`, `MainSectionHeaderLayout`,
`Hero`, `CoverHero`, `Tabs`, `MasterDetailLayout`, `ButtonFixedFooterLayout`, `SuccessFeedbackScreen`,
`LoadingScreen`

## Tokens de Design (Quick Reference)

```tsx
import { skinVars, applyAlpha } from '@telefonica/mistica';

// Cores
skinVars.colors.textPrimary          // Texto principal
skinVars.colors.textSecondary        // Texto secundário
skinVars.colors.background           // Fundo da página
skinVars.colors.backgroundContainer  // Fundo de cards/containers
skinVars.colors.brand                // Cor primária da marca
skinVars.colors.success / .error / .warning

// Border radius
skinVars.borderRadii.container
skinVars.borderRadii.button
skinVars.borderRadii.input

// Alpha (use rawColors para applyAlpha)
const overlay = applyAlpha(skinVars.rawColors.backgroundBrand, 0.8);
```

## Tipografia (Quick Reference)

```tsx
{/* Text1-Text4 aceitam weight prop */}
<Text2 regular>Texto corpo padrão</Text2>
<Text2 medium>Texto destaque</Text2>
<Text2 light color={skinVars.colors.textSecondary}>Texto sutil</Text2>
<Text3 regular>Texto menor</Text3>

{/* Text5-Text10: peso fixo por skin, para display/headlines */}
<Text5>Texto grande</Text5>

{/* Títulos: peso definido pela skin */}
<Title1 as="h2">Título de seção</Title1>
<Title2 as="h3">Subtítulo de card</Title2>
```

## Acessibilidade (Obrigatório)

- `IconButton` e `NavigationBarAction` **sempre** precisam de `aria-label`
- Use prop `as` em `Title*`/`Text*` para semântica HTML correta: `<Title1 as="h1">`, `<Text2 as="p">`
- `ToggleIconButton` precisa de `aria-label` em ambos `checkedProps` e `uncheckedProps`
- Links de navegação: prefira `to="/path"` (client-side) a `href` quando possível (requer `theme.Link`)

## Spacing Responsivo

Além de valores numéricos fixos, `Inline` aceita distribuição responsiva:

```tsx
<Inline space="between">  {/* first flush start, last flush end */}
  <Logo />
  <NavigationActions />
</Inline>

<Inline space="around">   {/* half-size space on either end */}
<Inline space="evenly">   {/* equal space around each item */}

{/* Spacing responsivo por breakpoint */}
<Box paddingX={{mobile: 16, desktop: 24}}>
  ...
</Box>
```

## Padrão de Asset para Cards e Rows

```tsx
<Circle backgroundColor={skinVars.colors.brandLow} size={40}>
  <IconShopRegular color={skinVars.colors.brand} />
</Circle>
```

## Skeleton Loading Pattern

```tsx
{isLoading ? (
  <Stack space={16}>
    <SkeletonLine width="40%" />
    <SkeletonText />
    <Inline space={16}>
      <SkeletonCircle size={40} />
      <SkeletonLine width="60%" />
    </Inline>
  </Stack>
) : (
  // conteúdo real
)}
```

## Formato de Entrega (Views)

```tsx
// [nome-componente].view.tsx
import React from 'react';
import {
  Box, Stack, Text2, Title1, ButtonPrimary,
  skinVars,
} from '@telefonica/mistica';

interface Props {
  data: SomeData;
  onAction: () => void;
  isLoading?: boolean;
}

MeuComponenteView.testId = 'meu-componente-view';

export function MeuComponenteView({ data, onAction, isLoading }: Props) {
  return (
    <Box dataAttributes={{ testid: MeuComponenteView.testId }}>
      <Stack space={16}>
        <Title1>{data.titulo}</Title1>
        <Text2 regular color={skinVars.colors.textSecondary}>
          {data.descricao}
        </Text2>
        <ButtonPrimary onPress={onAction}>
          Ação
        </ButtonPrimary>
      </Stack>
    </Box>
  );
}
```

## Checklist Final

Antes de entregar qualquer implementação:

- [ ] Nenhuma cor hardcodada (`#hex`, `rgb()`, nome CSS)?
- [ ] Raw HTML usado somente onde necessário (sem `<div>`/`<span>` para layout quando Mistica resolve)?
- [ ] Spacing usa valores padrão via Stack/Inline/Box?
- [ ] Componentes de texto têm `weight` (regular/medium/light) quando Text1-Text4?
- [ ] Todas as props validadas na documentação ou arquivo de tipos?
- [ ] Nenhuma lógica de negócio na view (apenas renderização)?
- [ ] Imports apenas de `@telefonica/mistica`?
- [ ] Hooks React com namespace correto (`React.useState`, etc.)?
