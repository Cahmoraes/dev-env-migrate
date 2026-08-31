# Formulários — Mistica

> Fonte: https://github.com/Telefonica/mistica-web/blob/master/doc/forms.md

## Exemplo Completo de Formulário

```tsx
import {Form, TextField, EmailField, ButtonPrimary, Stack} from '@telefonica/mistica';

const validateNome = (nome: string) => (/^\w+$/.test(nome) ? '' : 'Nome inválido');

const MeuFormulario = () => {
  const handleSubmit = ({nome, email}: {nome: string; email: string}) =>
    api.enviar({nome, email}).then(() => {
      // sucesso
    });

  return (
    <Form onSubmit={handleSubmit}>
      <Stack space={16}>
        <TextField name="nome" label="Nome completo" validate={validateNome} />
        <EmailField name="email" label="E-mail" />
        <ButtonPrimary submit>Enviar</ButtonPrimary>
      </Stack>
    </Form>
  );
};
```

## Notas Importantes

- Botão de submit **deve** incluir a prop `submit`
- O handler `onSubmit` previne automaticamente o evento de submit padrão
- Campos de formulário são **obrigatórios por padrão** — adicione `optional` para marcar como opcional
- `onSubmit` recebe um objeto com `{nomeCampo: valor}` e deve retornar uma Promise
- Enquanto o form está submetendo: todos os campos são desabilitados e spinner aparece no botão
- `validate` prop aceita função que retorna string de erro ou string vazia se válido
- `initialValues` aceita objeto com valores iniciais: `<Form initialValues={{email: prevEmail}}>`

## Campos de Formulário

### TextField

```tsx
<TextField
  name="nome"
  label="Nome"
  value={nome}
  onChangeValue={setNome}
  error={errors.nome}
  helper="Texto de ajuda"
  optional
/>
```

### EmailField

- Validação nativa de formato de e-mail
- Teclado de e-mail em mobile
- Autocomplete para e-mail atual (desabilite com `autoComplete="off"`)

```tsx
<EmailField name="email" label="E-mail" />
```

### PasswordField

- Ícone "olho" para mostrar/ocultar senha
- Use `autoComplete="current-password"` para senha existente
- Use `autoComplete="new-password"` para nova senha

```tsx
<PasswordField name="senha" label="Senha" autoComplete="new-password" />
```

### PhoneNumberField

- Usa `libphonenumber` do Google para formatação
- Formata enquanto digita, baseado no locale do tema

```tsx
<PhoneNumberField name="telefone" label="Telefone" />
```

### Select

```tsx
<Select
  name="pais"
  label="País"
  options={[
    {value: 'br', text: 'Brasil'},
    {value: 'ar', text: 'Argentina'},
    {value: 'cl', text: 'Chile'},
  ]}
/>
```

### DateField

- Usa date picker nativo do device/browser

```tsx
<DateField name="dataNascimento" label="Data de nascimento" />
```

### IntegerField / DecimalField

- Mostra teclado numérico em mobile
- `IntegerField`: apenas inteiros
- `DecimalField`: valores decimais (separador baseado no locale)

```tsx
<IntegerField name="quantidade" label="Quantidade" />
<DecimalField name="preco" label="Preço" />
```

### IbanField

- Formata IBAN enquanto digita
- Valida usando checksum

```tsx
<IbanField name="iban" label="IBAN" />
```

### CreditCardFields (conjunto)

Renderiza 3 campos: número, expiração e CVV. Validações built-in.

```tsx
<CreditCardFields />
```

Ou individualmente:

```tsx
<CreditCardNumberField name="numero" label="Número do cartão" acceptedCards={{visa: true, masterCard: true}} />
<CreditCardExpirationField name="expiracao" label="Validade" />
<CvvField name="cvv" label="CVV" />
```

### Switch / Checkbox / RadioGroup

```tsx
{/* Switch */}
<Switch name="newsletter">Receber newsletter</Switch>

{/* Checkbox */}
<Checkbox
  name="termos"
  checked={aceitouTermos}
  onChange={setAceitouTermos}
>
  Aceito os termos e condições
</Checkbox>

{/* RadioGroup */}
<RadioGroup
  name="plano"
  value={planoSelecionado}
  onChange={setPlanoSelecionado}
>
  <Stack space={12}>
    <RadioButton value="basico">Plano Básico</RadioButton>
    <RadioButton value="pro">Plano Pro</RadioButton>
    <RadioButton value="enterprise">Plano Enterprise</RadioButton>
  </Stack>
</RadioGroup>
```

### SearchField / PinField / FileUpload / Autocomplete

```tsx
<SearchField name="busca" label="Buscar" onChangeValue={setBusca} />
<PinField name="pin" label="PIN" length={4} />
<FileUpload name="documento" label="Enviar documento" accept=".pdf,.doc" />
<Autocomplete name="cidade" label="Cidade" getSuggestions={getCidades} />
```

## DoubleField

Coloca dois campos lado a lado com proporções configuráveis.

```tsx
<DoubleField layout="50/50">
  <TextField name="primeiroNome" label="Primeiro nome" />
  <TextField name="ultimoNome" label="Último nome" />
</DoubleField>

{/* Proporções disponíveis: '50/50', '40/60', '60/40' */}
```

## Hook useForm

Acessa o contexto do formulário para lógica avançada.

```tsx
import {useForm} from '@telefonica/mistica';

const MeuCampoCustom = () => {
  const {values, setFieldValue, errors} = useForm();

  return (
    <TextField
      name="campoCustom"
      label="Campo"
      value={values.campoCustom}
      onChangeValue={(val) => setFieldValue('campoCustom', val)}
      error={errors.campoCustom}
    />
  );
};
```

## Formulário com Layout Padrão

```tsx
<Form initialValues={{nome: '', email: '', pais: 'br'}} onSubmit={handleSubmit}>
  <Stack space={16}>
    <TextField name="nome" label="Nome" />
    <EmailField name="email" label="E-mail" />
    <PhoneNumberField name="telefone" label="Telefone" optional />
    <DoubleField>
      <DateField name="dataInicio" label="Data início" />
      <DateField name="dataFim" label="Data fim" />
    </DoubleField>
    <Select
      name="pais"
      label="País"
      options={[{value: 'br', text: 'Brasil'}, {value: 'ar', text: 'Argentina'}]}
    />
    <Switch name="newsletter">Receber newsletter</Switch>
    <ButtonLayout
      primaryButton={
        <ButtonPrimary submit loadingText="Enviando...">Enviar</ButtonPrimary>
      }
    />
  </Stack>
</Form>
```

## Formulário com Footer Fixo

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
