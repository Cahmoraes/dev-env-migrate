# Workflow de Análise e Implementação do Figma

> Referência para a skill `mistica-figma-layout`.
> Define o workflow completo de análise do design até implementação final.

## Etapa 1: Consulta Inicial ao Figma MCP

**Ação**: Execute `#figma/mcp-server-guide`

**Objetivo**: Obter acesso às ferramentas do Figma MCP e iniciar a análise do design

**Observação**: Identifique:
- URL ou ID do design fornecido pelo usuário
- Ferramentas disponíveis no Figma MCP
- Método de acesso ao design (link direto, print, descrição)

## Etapa 2: Análise do Design

**Ação**: Use as ferramentas do Figma MCP para extrair informações do design

**Pensamento**: Identifique e documente:

### Estrutura Hierárquica
- Qual é o componente raiz?
- Quais são os containers principais?
- Como os elementos estão organizados (vertical/horizontal)?

### Componentes Visuais
- Quais componentes do Mistica correspondem aos elementos do design?
  - Botões → ButtonPrimary, ButtonSecondary, ButtonLink
  - Textos → Text1-6, Title1-3, Heading1-6
  - Campos → TextField, EmailField, PasswordField, Select
  - Layout → Stack, Inline, Box
  - Ícones → Icon*Regular, Icon*Light, Icon*Filled

### Tokens Identificados
- **Cores**: quais cores são usadas? Mapear para `vars.colors.*`
- **Spacing**: quais espaçamentos entre elementos? (8, 16, 24, 32...)
- **Tipografia**: quais tamanhos e pesos de texto?
- **Radius**: bordas arredondadas?

### Elementos a Ignorar
- Tab Bar superior/inferior
- Nav Bar
- Status bar
- Modals/Sheets nativos
- Qualquer elemento de UI nativa do mobile

## Etapa 3: Criar Plano de Ação

**Ação**: Use `manage_todo_list` para criar um checklist estruturado

**Exemplo**:
```
1. Configurar imports dos componentes Mistica
2. Implementar container principal (Box)
3. Implementar Stack principal com spacing 24
4. Implementar seção de cabeçalho (título + descrição)
5. Implementar formulário com TextField, EmailField
6. Implementar rodapé com ButtonPrimary
7. Validar tokens e propriedades
8. Revisar acessibilidade
```

## Etapa 4: Implementação Progressiva

**Ação**: Implemente o código seguindo o plano, marcando cada item como completo

**Observação**: A cada componente implementado:

1. **Valide o componente no arquivo de tipos**:
   - Use grep_search em `../../node_modules/@telefonica/mistica/dist/index.d.ts`
   - Confirme que as props usadas existem

2. **Verifique tokens**:
   - Cores são de `vars.colors.*`?
   - Spacing usa valores padrão do Mistica?
   - Tipografia usa componentes Text/Title/Heading?

3. **Confirme estrutura**:
   - Hierarquia fiel ao Figma?
   - Layout responsivo adequado?
   - Acessibilidade respeitada?

## Etapa 5: Validação Final

**Ação**: Execute a checklist completa em `validation-checklist.md`

**Pensamento**: Revise cada item:
- ✅ Componentes oficiais Mistica
- ✅ Tokens corretos
- ✅ Props validadas
- ✅ Sem tags HTML
- ✅ Fidelidade ao Figma
- ✅ Acessibilidade
- ✅ Apenas componente principal (sem headers nativos)

## Etapa 6: Resposta Final

**Ação**: Entregue o código implementado no arquivo indicado pelo usuário

**Formato**:
```tsx
// [nome-do-arquivo].view.tsx
import { ... } from '@telefonica/mistica';

interface Props {
  // props do controller
}

export const ComponentView: React.FC<Props> = (props) => {
  return (
    // implementação
  );
};
```

## Metodologia ReAct Obrigatória

Em cada etapa, documente:

```
Pensamento: [análise do que você precisa fazer]
Ação: [comando ou implementação concreta]
Observação: [resultado obtido ou validação]
```

## Pontos de Atenção

- Não pule a consulta ao Figma MCP no início
- Sempre crie um plano antes de implementar
- Valide progressivamente, não apenas no final
- Documente decisões sobre mapeamento Figma → Mistica
- Justifique quando não houver correspondência exata de componentes
