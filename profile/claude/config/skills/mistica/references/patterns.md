# Patterns e Boas Práticas do Mistica

> Fonte: https://github.com/Telefonica/mistica-web/blob/master/doc/patterns.md

## Regras Críticas

1. **NUNCA hardcode cores** — sempre `skinVars.colors.*`
2. **NUNCA use `<div>` para layout** — use `Box`, `Stack`, `Inline`, `ResponsiveLayout`, `GridLayout`, `Grid`
3. **NUNCA defina font-size manualmente** — use `Text1`–`Text10`, `Title1`–`Title4`
4. **NUNCA defina border-radius manualmente** — use `skinVars.borderRadii.*` ou componentes que gerenciam isso
5. **Sempre envolva o app** com `ThemeContextProvider` e importe `@telefonica/mistica/css/mistica.css`
6. **Sempre namespaceie hooks React**: `React.useState`, `React.useEffect`, `React.useRef`
7. **Adicione `'use client';`** em componentes cliente no Next.js app router

## Composição de Página Padrão

```tsx
// Navegação (direto no nível da página, fora de ResponsiveLayout)
<MainNavigationBar sections={[...]} selectedIndex={0} />

// Header (direto no nível da página)
<HeaderLayout
  header={<Header pretitle="Seção" title="Título da Página" description="Descrição" />}
/>

// Conteúdo
<ResponsiveLayout>
  <Box paddingY={24}>
    <Stack space={32}>
      {/* Seção 1 */}
      <Stack space={16}>
        <Title1 as="h2">Título da Seção</Title1>
        <Text2 regular as="p">Descrição da seção</Text2>
      </Stack>

      {/* Seção 2 - Lista */}
      <Stack space={16}>
        <Title1 as="h2">Outra Seção</Title1>
        <NegativeBox>
          <RowList>
            <Row title="Item 1" onPress={() => {}} />
            <Row title="Item 2" onPress={() => {}} />
          </RowList>
        </NegativeBox>
      </Stack>
    </Stack>
  </Box>
</ResponsiveLayout>
```

### Ritmo Vertical (Regra 24/32/16)

- **Containers**: 24px padding top/bottom (`<Box paddingY={24}>`)
- **Seções**: 32px espaço entre elas (`<Stack space={32}>`)
- **Elementos**: 16px espaço entre eles (`<Stack space={16}>`)

## Layout: Faça vs. Não Faça

### ✅ Use layout components

```tsx
<Stack space={16}>
  <Text2 regular>Primeiro</Text2>
  <Text2 regular>Segundo</Text2>
</Stack>

<Inline space={16}>
  <ButtonPrimary onPress={() => {}}>Aceitar</ButtonPrimary>
  <ButtonSecondary onPress={() => {}}>Cancelar</ButtonSecondary>
</Inline>

<Box padding={16}>
  <Text2 regular>Conteúdo com padding</Text2>
</Box>
```

### ❌ Não use divs para spacing/layout

```tsx
// ERRADO
<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
  <div style={{padding: 16}}>
    <span style={{fontSize: 14, color: '#333'}}>Texto</span>
  </div>
</div>
```

## Cores: Faça vs. Não Faça

### ✅ Use design tokens

```tsx
import {skinVars, applyAlpha} from '@telefonica/mistica';

<Text2 regular color={skinVars.colors.textSecondary}>Texto secundário</Text2>

// Semi-transparente (use rawColors com applyAlpha)
const overlay = applyAlpha(skinVars.rawColors.backgroundBrand, 0.8);
```

### ❌ Não use cores hardcodadas

```tsx
// ERRADO
<Text2 regular color="#666">Texto</Text2>
<div style={{backgroundColor: '#f5f5f5'}}>...</div>
```

## Padrões Responsivos

```tsx
const {isDesktopOrBigger} = useScreenSize();

return (
  <ResponsiveLayout>
    <Box paddingY={24}>
      {isDesktopOrBigger ? (
        <GridLayout template="6+6" left={<ConteudoEsquerda />} right={<ConteudoDireita />} />
      ) : (
        <Stack space={16}>
          <ConteudoEsquerda />
          <ConteudoDireita />
        </Stack>
      )}
    </Box>
  </ResponsiveLayout>
);
```

## Padrões de Formulário

### Estado automático (preferido)

```tsx
<Form initialValues={{email: '', nome: ''}} onSubmit={(formData) => api.submit(formData)}>
  <Stack space={16}>
    <TextField name="nome" label="Nome" />
    <EmailField name="email" label="E-mail" />
    <PhoneNumberField name="telefone" label="Telefone" optional />
    <Select
      name="pais"
      label="País"
      options={[
        {value: 'br', text: 'Brasil'},
        {value: 'ar', text: 'Argentina'},
      ]}
    />
    <ButtonLayout
      primaryButton={
        <ButtonPrimary submit loadingText="Enviando...">Enviar</ButtonPrimary>
      }
    />
  </Stack>
</Form>
```

### Formulário com footer fixo

```tsx
<ButtonFixedFooterLayout button={<ButtonPrimary submit>Continuar</ButtonPrimary>}>
  <ResponsiveLayout>
    <Box paddingY={24}>
      <Form onSubmit={handleSubmit}>
        <Stack space={16}>
          <TextField name="nome" label="Nome" />
          <EmailField name="email" label="E-mail" />
        </Stack>
      </Form>
    </Box>
  </ResponsiveLayout>
</ButtonFixedFooterLayout>
```

## Padrões de Cards

### Asset pattern (idiomático)

```tsx
<Circle backgroundColor={skinVars.colors.brandLow} size={40}>
  <IconShopRegular color={skinVars.colors.brand} />
</Circle>
```

### Grid de cards

```tsx
<ResponsiveLayout>
  <Box paddingY={24}>
    <Stack space={16}>
      <Title1 as="h2">Produtos</Title1>
      <Carousel
        itemsPerPage={{mobile: 1, tablet: 2, desktop: 3}}
        items={produtos.map((p) => (
          <DataCard
            key={p.id}
            asset={
              <Circle backgroundColor={skinVars.colors.brandLow} size={40}>
                <IconShopRegular color={skinVars.colors.brand} />
              </Circle>
            }
            title={p.nome}
            description={p.descricao}
            buttonPrimary={
              <ButtonPrimary small onPress={() => navigate(p.url)}>Ver</ButtonPrimary>
            }
          />
        ))}
      />
    </Stack>
  </Box>
</ResponsiveLayout>
```

## Padrões de Listas

### Lista não-boxed com NegativeBox (obrigatório dentro de ResponsiveLayout)

```tsx
<ResponsiveLayout>
  <Box paddingY={24}>
    <NegativeBox>
      <RowList>
        <Row
          asset={
            <Circle backgroundColor={skinVars.colors.brandLow} size={40}>
              <IconSettingsRegular color={skinVars.colors.brand} />
            </Circle>
          }
          title="Configurações"
          description="Ajustes do app"
          onPress={() => {}}
        />
      </RowList>
    </NegativeBox>
  </Box>
</ResponsiveLayout>
```

### Lista boxed (sem NegativeBox)

```tsx
<BoxedRowList>
  <BoxedRow title="Opção A" onPress={() => {}} />
  <BoxedRow title="Opção B" onPress={() => {}} />
</BoxedRowList>
```

## Seções com Variantes de Cor

```tsx
{/* Seção Brand */}
<ResponsiveLayout variant="brand" fullWidth>
  <ResponsiveLayout>
    <Box paddingY={24}>
      <Title1>Seção Destacada</Title1>
      <Text2 regular>As cores se adaptam automaticamente</Text2>
    </Box>
  </ResponsiveLayout>
</ResponsiveLayout>

{/* Seção Alternativa */}
<ResponsiveLayout variant="alternative" fullWidth>
  <ResponsiveLayout>
    <Box paddingY={24}>
      <Text2 regular>Fundo alternativo</Text2>
    </Box>
  </ResponsiveLayout>
</ResponsiveLayout>
```

Variantes disponíveis: `'default'`, `'brand'`, `'negative'`, `'alternative'`, `'media'`

## Skeleton Loading

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
  <Stack space={16}>
    <Title1>{data.titulo}</Title1>
    <Text2 regular>{data.descricao}</Text2>
  </Stack>
)}
```

## Fluxo Funnel (Step-by-step)

```tsx
<Stack space={32}>
  <FunnelNavigationBar
    right={
      <NavigationBarActionGroup>
        <NavigationBarAction aria-label="Fechar" onPress={handleFechar}>
          <IconCloseRegular color="currentColor" />
        </NavigationBarAction>
      </NavigationBarActionGroup>
    }
  />
  <ResponsiveLayout>
    <Stack space={24}>
      <Stepper currentIndex={currentStep} steps={['Pessoal', 'Endereço', 'Pagamento', 'Confirmação']} />
      {currentStep === 0 && <FormularioPessoal />}
      {currentStep === 1 && <FormularioEndereco />}
    </Stack>
  </ResponsiveLayout>
</Stack>
```

## Modo Escuro

Mistica suporta dark mode automaticamente via `colorScheme` no theme config:
- `'auto'` (padrão) — segue preferência do OS/browser
- `'light'` — força modo claro
- `'dark'` — força modo escuro

Todos os `skinVars.colors.*` resolvem automaticamente para os valores do dark mode.
