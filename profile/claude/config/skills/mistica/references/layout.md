# Layout — Primitivas e Page Layouts do Mistica

> Fonte: https://github.com/Telefonica/mistica-web/blob/master/doc/layout.md

## TOC

- [Primitivas de Layout](#primitivas-de-layout)
  - [Box](#box)
  - [Stack](#stack)
  - [Inline](#inline)
  - [Align](#align)
  - [Grid / GridItem](#grid--griditem)
  - [NegativeBox](#negativebox)
  - [Divider](#divider)
  - [HorizontalScroll](#horizontalscroll)
  - [Boxed](#boxed)
  - [Overlay](#overlay)
  - [StackingGroup](#stackinggroup)
- [Page Layouts](#page-layouts)
  - [ResponsiveLayout](#responsivelayout)
  - [HeaderLayout](#headerlayout)
  - [Componentes com ResponsiveLayout interno](#componentes-com-responsivelayout-interno)
  - [GridLayout](#gridlayout)
  - [MasterDetailLayout](#masterdetaillayout)
  - [FixedFooterLayout](#fixedfooterlayout)
  - [ButtonFixedFooterLayout](#buttonfixedfooterlayout)
  - [ButtonLayout](#buttonlayout)
  - [DoubleField](#doublefield)
- [Ritmo Vertical](#ritmo-vertical)

---

## Primitivas de Layout

### Box

Fornece padding para criar elementos container. Todos os props de padding aceitam número ou objeto responsivo `{mobile, tablet?, desktop}`.

```tsx
<Box paddingX={16} paddingY={32}>
  <Child />
</Box>

// ⚠️ Não use Box para adicionar espaçamento externo ou distribuir itens — use Stack ou Inline
```

### Stack

Distribui filhos verticalmente com separação `space`.

```tsx
<Stack space={24}>
  <Child1 />
  <Child2 />
  <Child3 />
</Stack>
```

### Inline

Distribui filhos horizontalmente. Equivalente horizontal do Stack. Cobre os casos de uso de `display: flex`.

Suporta:
- Distribuição horizontal via `space={number}` ou `space="between" | "around" | "evenly"`
- Alinhamento vertical via `alignItems="flex-start" | "flex-end" | "center" | "stretch" | "baseline"`
- Quebra de linha via `wrap` e espaçamento de linhas via `verticalSpace`

```tsx
{/* Espaçamento fixo */}
<Inline space={16} alignItems="center">
  <Child1 />
  <Child2 />
</Inline>

{/* Distribuição entre extremos */}
<Inline space="between">
  <LeftContent />
  <RightContent />
</Inline>

{/* Distribuição uniforme */}
<Inline space="evenly">
  <Tab1 />
  <Tab2 />
  <Tab3 />
</Inline>
```

### Align

Posiciona filhos usando CSS grid alignment. Para centralizar ou posicionar em área definida.

```tsx
<Align x="center" y="center" height="100%">
  <Text2 regular>Conteúdo centralizado</Text2>
</Align>

<Align x="end">
  <ButtonPrimary onPress={() => {}}>Ação</ButtonPrimary>
</Align>
```

### Grid / GridItem

Componente CSS Grid de baixo nível para layouts customizados. Para layouts de página, prefira `GridLayout`.

```tsx
<Grid columns={3} gap={{mobile: 8, desktop: 16}}>
  <Card1 />
  <Card2 />
  <Card3 />
</Grid>

<Grid columns={4} gap={16}>
  <GridItem columnSpan={2}>
    <FeatureCard />
  </GridItem>
  <GridItem><SmallCard1 /></GridItem>
  <GridItem><SmallCard2 /></GridItem>
</Grid>
```

### NegativeBox

Necessário ao usar `RowList` (não-boxed) dentro de `ResponsiveLayout` para que o hover e alinhamento funcionem corretamente.

```tsx
<ResponsiveLayout>
  <NegativeBox>
    <RowList>
      <Row title="Item 1" onPress={() => {}} />
      <Row title="Item 2" onPress={() => {}} />
    </RowList>
  </NegativeBox>
</ResponsiveLayout>
```

Use `left` ou `right` prop para aplicar margem negativa em apenas um lado.

### Divider

Linha divisória horizontal. Adapta sua cor ao contexto de variante atual. Sem props.

```tsx
<Stack space={16}>
  <Text2 regular>Seção A</Text2>
  <Divider />
  <Text2 regular>Seção B</Text2>
</Stack>
```

### HorizontalScroll

Habilita scroll horizontal para os filhos. Para rows de chips, cards, etc.

```tsx
<HorizontalScroll>
  <Inline space={8}>
    <Chip>Opção 1</Chip>
    <Chip>Opção 2</Chip>
    <Chip>Opção 3</Chip>
  </Inline>
</HorizontalScroll>
```

### Boxed

Container arredondado com cor de fundo e borda opcional. Adapta ao contexto de variante. Para seções card-like sem semântica de card.

```tsx
<Boxed>
  <Box padding={16}>
    <Text2 regular>Conteúdo em container</Text2>
  </Box>
</Boxed>
```

### Overlay

Overlay fixo em tela cheia cobrindo o viewport. Usado por dialogs, drawers e sheets internamente.

```tsx
<Overlay onPress={handleFechar} disableScroll>
  <MeuModal />
</Overlay>
```

### StackingGroup

Exibe grupo de itens (tipicamente avatars) com sobreposição opcional. Mostra indicador "+N" quando excede `maxItems`.

```tsx
<StackingGroup stacked maxItems={3} moreItemsStyle={{type: 'circle', size: 40}}>
  <Avatar size={40} src={avatar1} />
  <Avatar size={40} src={avatar2} />
  <Avatar size={40} src={avatar3} />
  <Avatar size={40} src={avatar4} />
</StackingGroup>
```

---

## Page Layouts

### ResponsiveLayout

Container responsivo principal. Tamanho depende do viewport. Suporta `variant` para cor de fundo e `fullWidth` para remover restrições de margem.

```tsx
<ResponsiveLayout>
  <MinhaFeature />
</ResponsiveLayout>

<ResponsiveLayout variant="brand" fullWidth>
  <ResponsiveLayout>
    <Box paddingY={24}>
      <Text2 regular>Seção brand</Text2>
    </Box>
  </ResponsiveLayout>
</ResponsiveLayout>
```

### HeaderLayout

Responsável por renderizar o header da página. Usa `ResponsiveLayout` internamente — **não envolva em um**.

```tsx
<HeaderLayout header={<Header title="Header" />} />
<ResponsiveLayout>
  <MinhaFeature />
</ResponsiveLayout>
```

### Componentes com ResponsiveLayout interno

**Não envolva estes componentes em `ResponsiveLayout`** — eles gerenciam o próprio layout:

| Componente | Razão |
|---|---|
| `HeaderLayout` | Envolve conteúdo do header em container responsivo |
| `MainSectionHeaderLayout` | Tem seu próprio wrapper responsivo |
| `Hero` / `CoverHero` | Gerencia layout responsivo interno para conteúdo e mídia |
| `MasterDetailLayout` | Grid responsivo full-width gerenciado internamente |
| `ButtonFixedFooterLayout` | Botões alinhados via container responsivo interno |
| `NavigationBar` (e variantes) | Centraliza conteúdo com `ResponsiveLayout` interno |
| `Tabs` | Lista de tabs com `ResponsiveLayout fullWidth` |
| `SuccessFeedbackScreen` (e variantes) | Contém próprio page layout |
| `LoadingScreen` | `BrandLoadingScreen` também usa layout interno |

Coloque-os **diretamente no nível da página**, ao lado de `ResponsiveLayout`:

```tsx
<MainNavigationBar sections={[...]} selectedIndex={0} />
<HeaderLayout header={<Header title="Página" />} />
<Tabs selectedIndex={0} onChange={setTab} tabs={[{text: 'Tab 1'}, {text: 'Tab 2'}]} />
<ResponsiveLayout>
  <Box paddingY={24}>
    <Text2 regular>Conteúdo</Text2>
  </Box>
</ResponsiveLayout>
```

### GridLayout

Grid de 12 colunas com templates predefinidos. Deve ser usado dentro de `ResponsiveLayout`.

Templates disponíveis:
- Split layouts (use props `left`/`right`): `'6+6'`, `'8+4'`, `'5+4'`, `'4+6'`, `'3+9'`
- Coluna central única (use `children`): `'10'`, `'8'`
- Sem template (grid de 12 colunas, use `children`)

```tsx
<ResponsiveLayout>
  <GridLayout
    template="6+6"
    left={<ConteudoEsquerda />}
    right={<ConteudoDireita />}
  />
</ResponsiveLayout>
```

### MasterDetailLayout

Lista na esquerda + detalhe na direita. Em mobile: navegação de 2 níveis.

```tsx
<MasterDetailLayout
  isOpen={isOpen}
  master={listaView}
  detail={isOpen ? detalheView : estadoVazio}
/>
```

### FixedFooterLayout

Footer que fica fixo no bottom do viewport quando há altura suficiente.

```tsx
<FixedFooterLayout
  footer={
    <Box paddingX={16} paddingY={8}>
      <ButtonLayout primaryButton={<ButtonPrimary onPress={handleSubmit}>Confirmar</ButtonPrimary>} />
    </Box>
  }
>
  <ResponsiveLayout>
    <Box paddingY={24}>
      <Stack space={16}>{/* conteúdo da página */}</Stack>
    </Box>
  </ResponsiveLayout>
</FixedFooterLayout>
```

### ButtonFixedFooterLayout

Wrapper conveniente ao redor de `FixedFooterLayout` para páginas com footer de botões.

```tsx
<ButtonFixedFooterLayout
  button={<ButtonPrimary onPress={handleConfirmar}>Confirmar</ButtonPrimary>}
  secondaryButton={<ButtonSecondary onPress={handleCancelar}>Cancelar</ButtonSecondary>}
>
  <ResponsiveLayout>
    <Box paddingY={24}>
      <Stack space={16}>{/* conteúdo da página */}</Stack>
    </Box>
  </ResponsiveLayout>
</ButtonFixedFooterLayout>
```

### ButtonLayout

Arranja botão primário, secundário e/ou link em layout padronizado.

```tsx
<ButtonLayout
  align="full-width"
  primaryButton={<ButtonPrimary onPress={handlePrimario}>Aceitar</ButtonPrimary>}
  secondaryButton={<ButtonSecondary onPress={handleSecundario}>Cancelar</ButtonSecondary>}
/>
```

### DoubleField

Coloca dois campos de formulário lado a lado com proporções configuráveis.

```tsx
<DoubleField layout="50/50">
  <TextField name="primeiroNome" label="Primeiro nome" />
  <TextField name="ultimoNome" label="Último nome" />
</DoubleField>
```

Proporções disponíveis: `'50/50'`, `'40/60'`, `'60/40'`

---

## Ritmo Vertical

```tsx
<HeaderLayout header={<Header title="Header" />} />
<ResponsiveLayout>
  <Box paddingY={24}>      {/* 24px no container */}
    <Stack space={32}>     {/* 32px entre seções */}
      <Stack space={16}>   {/* 16px entre elementos */}
        <Title1>Seção 1</Title1>
        <Text2 regular>Descrição</Text2>
      </Stack>

      <Stack space={16}>
        <Title1>Seção 2</Title1>
        <NegativeBox>
          <RowList>
            <Row title="Item" onPress={() => {}} />
          </RowList>
        </NegativeBox>
      </Stack>
    </Stack>
  </Box>
</ResponsiveLayout>
```
