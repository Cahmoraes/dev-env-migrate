# Restrições e O Que Não Fazer

> Referência para a skill `mistica-figma-layout`.
> Lista completa de restrições e práticas proibidas.

## Elementos Nativos Mobile (NÃO IMPLEMENTAR)

### ❌ NUNCA Implemente

- **Tab Bar** (superior ou inferior)
- **Nav Bar / Navigation Bar**
- **Status Bar** (barra de status do sistema)
- **Modals nativos** (use componentes Mistica se disponível)
- **Sheets nativos** (bottom sheets, action sheets)
- **Notificações push**
- **Splash screens**
- **Headers de navegação** com botão "voltar" do sistema

### ✅ Foque Apenas Em

O **componente principal da tela** — o conteúdo visível abaixo de headers nativos e acima de tab bars.

**Exemplo**: Se o Figma mostra uma tela de checkout com Tab Bar inferior:
- ❌ Não implemente a Tab Bar
- ✅ Implemente apenas o formulário de checkout

## Tags HTML (PROIBIDAS)

### ❌ NUNCA Use

```tsx
// PROIBIDO
<div>...</div>
<span>...</span>
<p>...</p>
<h1>, <h2>, <h3>...
<button>...</button>
<input />
<form>...</form>
<img />
<a>...</a>
<ul>, <li>
<section>, <article>, <header>, <footer>
```

### ✅ Use Componentes Mistica

```tsx
// CORRETO
<Box>...</Box>          // ao invés de <div>
<Text2 regular>...</Text2>  // ao invés de <span>, <p>
<Title1>...</Title1>    // ao invés de <h1>
<ButtonPrimary>...</ButtonPrimary>  // ao invés de <button>
<TextField />           // ao invés de <input>
<Form>...</Form>        // ao invés de <form>
<Image />               // ao invés de <img>
<ButtonLink>...</ButtonLink>  // ao invés de <a>
<Stack>...</Stack>      // ao invés de <ul>
```

## Arquivos e Estrutura (NÃO CRIAR)

### ❌ NÃO Crie

- **Arquivos de estilo separados**: `style.ts`, `styles.css`, `*.module.css`
- **Arquivos de teste**: `*.test.tsx`, `*.spec.tsx`
- **Controllers**: `.controller.tsx`, lógica de negócio
- **Hooks customizados**: `use*.ts` (a menos que solicitado explicitamente)
- **Tipos separados**: `types.ts` (inclua tipos na própria view)
- **Constantes separadas**: `constants.ts` (use inline)
- **Utilitários**: `utils.ts`, `helpers.ts`

### ✅ Crie Apenas

- **Arquivo de view**: `[nome].view.tsx` com o código solicitado

## Lógica de Negócio (NÃO IMPLEMENTAR)

### ❌ NÃO Inclua

- Chamadas a APIs (fetch, axios, React Query)
- Validações de formulário (deixe para o controller)
- Estados de negócio (useState de dados de domínio)
- useEffect com lógica complexa
- Regras de negócio ou cálculos
- Integrações com serviços externos
- Gerenciamento de estado global (Redux, Context)

### ✅ Receba via Props

```tsx
interface Props {
  data: CheckoutData;         // recebe dados processados
  onSubmit: () => void;       // recebe callback
  isLoading: boolean;         // recebe estado
  error?: string;             // recebe erro tratado
}

export const CheckoutView: React.FC<Props> = ({ data, onSubmit, isLoading, error }) => {
  // Apenas renderização visual
  return <Box>...</Box>;
};
```

## Consulta de Código (RESTRITA)

### ❌ NÃO Consulte

- **Outras views existentes** para se basear (evite contaminação de padrões)
- **Controllers** de outras features
- **Testes** de outros componentes
- **Arquivos não relacionados** ao design atual

### ✅ Consulte Apenas

- **Arquivo de tipos do Mistica**: `../../node_modules/@telefonica/mistica/dist/index.d.ts`
- **Documentação oficial** via mistica-web-docs (quando não estiver construindo do Figma)
- **Referências desta skill**: figma-workflow.md, mistica-tokens.md, etc.

## Tools e Ferramentas (USO RESTRITO)

### ❌ NÃO Use

- **mistica-web-docs** quando estiver construindo layout do Figma
  - Esta tool é para consultas isoladas de componentes
  - Para construção de layout, use apenas Figma MCP

### ✅ Use

- **Figma MCP** (`#figma/mcp-server-guide`, `figma-mcp/*`) para análise de design
- **grep_search** para validar propriedades no arquivo de tipos
- **manage_todo_list** para planejar implementação
- **file_search / read_file** apenas para validar tipos Mistica

## Formatação e Código (NÃO SE PREOCUPE)

### ❌ NÃO Gaste Tempo Com

- Formatação perfeita do código (prettier resolve)
- Organização de imports em ordem alfabética
- Comentários explicativos extensos
- Documentação JSDoc
- Performance prematura
- Otimizações sem necessidade

### ✅ Foque Em

- Código funcional e correto
- Componentes Mistica adequados
- Tokens corretos
- Fidelidade ao Figma

## Valores Literais (PROIBIDOS)

### ❌ NUNCA Use

```tsx
// CORES LITERAIS
color="#FF0000"
backgroundColor="blue"
color="rgb(255, 0, 0)"
style={{ color: '#333' }}

// SPACING LITERAL
margin: '10px'
padding: '15px 20px'
gap: 13  // valor não-padrão

// FONT SIZE LITERAL
fontSize: 16
fontWeight: 600
```

### ✅ Use Tokens e Padrões

```tsx
// CORES
<Text2 color={vars.colors.textPrimary}>...</Text2>

// SPACING
<Stack space={16}>...</Stack>
<Box padding={24}>...</Box>

// TIPOGRAFIA
<Text2 regular>...</Text2>
<Title1>...</Title1>
```

## Propriedades Inventadas (PROIBIDO)

### ❌ NÃO Invente Props

Se não tiver certeza se uma propriedade existe:

1. **Consulte o arquivo de tipos** primeiro
2. **Valide na documentação** (se necessário)
3. **NÃO use a prop** se não encontrar

```tsx
// ❌ ERRADO - props inventadas
<ButtonPrimary color="red" rounded large>...</ButtonPrimary>

// ✅ CORRETO - props validadas
<ButtonPrimary onPress={handleClick}>...</ButtonPrimary>
```

## Dependências Externas (NÃO ADICIONE)

### ❌ NÃO Importe

- Bibliotecas de estilo: styled-components, emotion, tailwind
- Bibliotecas de UI: Material-UI, Ant Design, Bootstrap
- Bibliotecas de ícones: react-icons, font-awesome
- Bibliotecas de formulário: formik, react-final-form (controller usa react-hook-form)
- Bibliotecas de animação: framer-motion, react-spring (view pode ter Skeletons Mistica)

### ✅ Use Apenas

```tsx
import { componentes } from '@telefonica/mistica';
import React from 'react';
```

## Checklist de Restrições

Antes de entregar, confirme:

- [ ] Nenhum elemento nativo mobile implementado
- [ ] Nenhuma tag HTML usada
- [ ] Nenhum arquivo extra criado (style, test, controller)
- [ ] Nenhuma lógica de negócio incluída
- [ ] Não consultou outras views do projeto
- [ ] Não usou mistica-web-docs durante construção do Figma
- [ ] Nenhum valor literal de cor ou spacing
- [ ] Nenhuma propriedade inventada
- [ ] Nenhuma dependência externa adicionada

Se algum item não foi respeitado, corrija antes de entregar.
