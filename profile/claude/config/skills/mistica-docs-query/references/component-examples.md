# Padrões de Exemplos de Componentes Mistica

> Referência para a skill `mistica-docs-query`.
> Define os padrões de código e exemplos a serem fornecidos ao usuário.

## Formato Geral

Todos os exemplos devem:
- Incluir import correto
- Usar TypeScript com tipagem adequada
- Mostrar casos de uso reais e práticos
- Incluir comentários explicativos quando relevante

## ButtonPrimary / ButtonSecondary / ButtonDanger / ButtonLink

```tsx
import { ButtonPrimary, ButtonSecondary } from '@telefonica/mistica';

{ /* Callback simples */ }
<ButtonPrimary onPress={() => doSomething()}>
  Comprar
</ButtonPrimary>

{ /* Link interno (React Router via ThemeContextProvider) */ }
<ButtonPrimary to="/checkout">
  Ir ao checkout
</ButtonPrimary>

{ /* Link externo em nova aba */ }
<ButtonPrimary href="https://exemplo.com" newTab>
  Visitar site
</ButtonPrimary>

{ /* Submit em formulário */ }
<Form onSubmit={handleSubmit}>
  <ButtonPrimary submit>Enviar</ButtonPrimary>
</Form>

{ /* Loading / spinner */ }
<ButtonPrimary 
  showSpinner 
  loadingText="Carregando..." 
  disabled
>
  Salvar
</ButtonPrimary>

{ /* Com ícone */ }
<ButtonPrimary 
  onPress={handleBack}
  StartIcon={(props) => <IconChevronLeftRegular {...props} />}
>
  Voltar
</ButtonPrimary>

{ /* Tracking personalizado */ }
<ButtonPrimary 
  href="/checkout"
  trackingEvent={{ category: 'checkout', action: 'cta_pressed' }}
>
  Comprar
</ButtonPrimary>

{ /* Track automático */ }
<ButtonPrimary to="/home" trackEvent>
  Ir para Home
</ButtonPrimary>
```

## Form e Campos de Entrada

```tsx
import { 
  Form, 
  TextField, 
  EmailField, 
  PasswordField,
  Select,
  ButtonPrimary 
} from '@telefonica/mistica';

<Form onSubmit={handleSubmit}>
  <Stack space={16}>
    <TextField
      name="name"
      label="Nome completo"
      value={name}
      onChangeValue={setName}
      error={errors.name}
    />
    
    <EmailField
      name="email"
      label="E-mail"
      value={email}
      onChangeValue={setEmail}
      error={errors.email}
    />
    
    <PasswordField
      name="password"
      label="Senha"
      value={password}
      onChangeValue={setPassword}
      error={errors.password}
    />
    
    <Select
      name="country"
      label="País"
      value={country}
      onChangeValue={setCountry}
      options={[
        { value: 'br', text: 'Brasil' },
        { value: 'ar', text: 'Argentina' },
        { value: 'cl', text: 'Chile' }
      ]}
    />
    
    <ButtonPrimary submit>Enviar</ButtonPrimary>
  </Stack>
</Form>
```

## Layout: Stack, Inline, Box

```tsx
import { Stack, Inline, Box, Text2 } from '@telefonica/mistica';

{ /* Stack - Empilhamento vertical */ }
<Stack space={16}>
  <Text2>Item 1</Text2>
  <Text2>Item 2</Text2>
  <Text2>Item 3</Text2>
</Stack>

{ /* Inline - Alinhamento horizontal */ }
<Inline space={8} alignItems="center">
  <IconInfoRegular />
  <Text2>Informação importante</Text2>
</Inline>

{ /* Box - Container com padding */ }
<Box padding={16}>
  <Text2>Conteúdo com espaçamento interno</Text2>
</Box>

{ /* Box com padding customizado por lado */ }
<Box paddingX={24} paddingY={16}>
  <Text2>Padding horizontal 24, vertical 16</Text2>
</Box>
```

## Tipografia: Text1-6, Title1-3, Heading

```tsx
import { Text1, Text2, Text3, Title1, Heading1 } from '@telefonica/mistica';

{ /* Texto regular */ }
<Text2 regular>Texto normal</Text2>

{ /* Texto com peso (weight) */ }
<Text2 medium>Texto médio</Text2>
<Text2 light>Texto leve</Text2>

{ /* Títulos */ }
<Title1>Título principal</Title1>
<Heading1>Cabeçalho de seção</Heading1>

{ /* Texto com cor customizada */ }
<Text2 color={vars.colors.textSecondary}>
  Texto em cor secundária
</Text2>
```

## Checkbox e RadioButton

```tsx
import { Checkbox, RadioGroup, RadioButton, Stack } from '@telefonica/mistica';

{ /* Checkbox simples */ }
<Checkbox
  name="terms"
  checked={acceptedTerms}
  onChange={setAcceptedTerms}
>
  Aceito os termos e condições
</Checkbox>

{ /* RadioGroup */ }
<RadioGroup
  name="plan"
  value={selectedPlan}
  onChange={setSelectedPlan}
>
  <Stack space={12}>
    <RadioButton value="basic">Plano Básico</RadioButton>
    <RadioButton value="pro">Plano Pro</RadioButton>
    <RadioButton value="enterprise">Plano Enterprise</RadioButton>
  </Stack>
</RadioGroup>
```

## Ícones

```tsx
import { 
  IconChevronLeftRegular,
  IconCheckRegular,
  IconInfoRegular,
  IconCloseRegular
} from '@telefonica/mistica';

{ /* Ícone standalone */ }
<IconCheckRegular color={vars.colors.success} size={24} />

{ /* Ícone com texto */ }
<Inline space={8} alignItems="center">
  <IconInfoRegular />
  <Text2>Mais informações</Text2>
</Inline>
```

## Boas Práticas Gerais

1. **Sempre use Stack/Inline para espaçamento** em vez de margin/padding customizados
2. **Prefira componentes Mistica** sobre tags HTML
3. **Use tokens de cor** (`vars.colors.*`) em vez de valores literais
4. **Valide propriedades weight** em componentes Text1-3
5. **Use trackEvent** para analytics quando aplicável
