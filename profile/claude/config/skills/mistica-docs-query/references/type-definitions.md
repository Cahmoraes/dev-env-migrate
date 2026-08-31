# Consulta de Definições de Tipo

> Referência para a skill `mistica-docs-query`.
> Orientações sobre como verificar propriedades e tipos no arquivo de definição do Mistica.

## Localização do Arquivo

O arquivo de definição de tipos do Mistica está em:

```
../../node_modules/@telefonica/mistica/dist/index.d.ts
```

## Como Consultar

Use `grep_search` para buscar componentes e propriedades:

### Buscar Interface de Componente

```
Busque por: "interface ButtonPrimaryProps"
ou: "export interface [ComponentName]Props"
```

### Buscar Exports de Componentes

```
Busque por: "export { ButtonPrimary }"
ou: "export const [ComponentName]"
```

### Buscar Tokens e Tipos

```
Busque por: "skinVars" para tokens de cor
Busque por: "spacing" para valores de espaçamento
```

## Estrutura Típica

As definições seguem o padrão:

```typescript
export interface ButtonPrimaryProps extends CommonProps {
  /** Texto do botão */
  children: React.ReactNode;
  
  /** Callback ao pressionar */
  onPress?: () => void;
  
  /** Link interno (React Router) */
  to?: string;
  
  /** Link externo */
  href?: string;
  
  /** Abrir em nova aba */
  newTab?: boolean;
  
  /** Mostrar spinner de loading */
  showSpinner?: boolean;
  
  /** Texto durante loading */
  loadingText?: string;
  
  /** Desabilitar botão */
  disabled?: boolean;
  
  /** Submit de formulário */
  submit?: boolean;
  
  /** Ícone no início do botão */
  StartIcon?: React.ComponentType<IconProps>;
  
  /** Ícone no fim do botão */
  EndIcon?: React.ComponentType<IconProps>;
  
  /** Evento de tracking */
  trackingEvent?: TrackingEvent;
  
  /** Ativar tracking automático */
  trackEvent?: boolean;
}
```

## Quando Consultar

Consulte o arquivo de tipos quando:
- Não tiver certeza sobre uma propriedade
- Precisar de todas as props disponíveis
- Quiser verificar tipos de valores aceitos
- Documentação oficial estiver incompleta

## Fluxo de Validação

1. Primeiro, use `mistica-web-docs` para documentação oficial
2. Se houver dúvidas sobre propriedades, consulte o arquivo de tipos
3. Sempre confirme que a propriedade existe antes de sugerir ao usuário
