# Checklist de Validação Final

## Validação Passo a Passo

SEJA 100% FIEL AO FIGMA CUSTE O QUE CUSTAR. Se houver alguma diferença na UI, seu trabalho será **REJEITADO**
Execute **todos** os itens abaixo antes de considerar a tarefa completa:

### 1. Componentes Mistica

- [ ] Todos os componentes usados são oficiais do Mistica Web
- [ ] Nenhuma tag HTML (`<div>`, `<span>`, `<p>`, etc.) foi utilizada
- [ ] Imports estão corretos: `import { ... } from '@telefonica/mistica'`
- [ ] Componentes existem no arquivo de tipos `index.d.ts`

```tsx
// ✅ CORRETO
<Stack space={16}>
  <Text2 regular>Conteúdo</Text2>
</Stack>

// ❌ ERRADO
<div style={{ margin: '16px' }}>
  <span>Conteúdo</span>
</div>
```

### 2. Tokens e Valores

- [ ] Todas as cores usam `vars.colors.*`
- [ ] Spacing usa valores padrão do Mistica (4, 8, 12, 16, 24, 32, 40)
- [ ] Componentes Text1-3 têm propriedade `weight` definida
- [ ] Nenhum valor literal de cor (#hex, rgb, nome)
- [ ] Nenhum margin/padding em valores customizados

```tsx
// ✅ CORRETO
<Text2 regular color={vars.colors.textSecondary}>Texto</Text2>
<Stack space={16}>...</Stack>

// ❌ ERRADO
<Text2 color="#666666">Texto</Text2>
<div style={{ margin: '15px' }}>...</div>
```

### 3. Propriedades (Props)

- [ ] Todas as props usadas foram validadas no arquivo de tipos
- [ ] Nenhuma prop inventada ou não documentada
- [ ] Props obrigatórias foram fornecidas
- [ ] Tipos de valores estão corretos (string, number, boolean, etc.)

**Como validar**: Use grep_search em `../../node_modules/@telefonica/mistica/dist/index.d.ts`

### 4. Fidelidade ao Figma

- [ ] Hierarquia de componentes corresponde ao design
- [ ] Espaçamentos respeitam as especificações
- [ ] Cores mapeadas corretamente para tokens Mistica
- [ ] Textos e tipografia conforme design
- [ ] Layout responsivo adequado para mobile

### 5. Ícones

- [ ] Ícones são do Mistica: `Icon*Regular`, `Icon*Light`, `Icon*Filled`
- [ ] Import correto: `import { IconCheckRegular } from '@telefonica/mistica'`
- [ ] Props de ícones (size, color) usadas quando necessário
- [ ] Ícones usados em contextos apropriados (botões, inline com texto, etc.)

```tsx
// ✅ CORRETO
import { IconCheckRegular } from '@telefonica/mistica';
<IconCheckRegular color={vars.colors.success} size={24} />

// ❌ ERRADO
<img src="check.svg" />
<i className="icon-check" />
```

### 6. Acessibilidade

- [ ] Labels descritivos em campos de formulário
- [ ] Hierarquia semântica de títulos respeitada (Title1 > Title2 > Text)
- [ ] Cores com contraste adequado (responsabilidade dos tokens Mistica)
- [ ] Botões têm texto descritivo ou aria-label quando necessário
- [ ] Campos de formulário têm name e label

### 7. Estrutura e Organização

- [ ] Arquivo é uma view (.view.tsx)
- [ ] Apenas layout e visual implementados (sem lógica de negócio)
- [ ] Props da interface estão tipadas
- [ ] Export do componente está correto
- [ ] Nenhum controller, teste ou lógica de negócio incluída

```tsx
// ✅ CORRETO
interface Props {
  title: string;
  onSubmit: () => void;
}

export const CheckoutView: React.FC<Props> = ({ title, onSubmit }) => {
  return <Box>...</Box>;
};
```

### 8. Elementos Ignorados

- [ ] Tab Bar superior/inferior não foi implementada
- [ ] Nav Bar não foi implementada
- [ ] Status bar não foi incluída
- [ ] Modals/Sheets nativos do mobile não foram implementados
- [ ] Foco apenas no componente principal da tela

### 9. Boas Práticas React

- [ ] Imports organizados (Mistica, tipos, outros)
- [ ] Componentes nomeados semanticamente
- [ ] TSX legível e bem indentado
- [ ] Sem código comentado ou desnecessário
- [ ] Sem console.logs ou código de debug

### 10. Restrições Atendidas

- [ ] Não criou arquivo de estilo separado (style.ts/css)
- [ ] Não implementou testes
- [ ] Não implementou controller
- [ ] Não consultou outras views existentes
- [ ] Não usou mistica-web-docs (apenas Figma MCP para construção)

## Validação Final Narrativa

Após completar o checklist, responda:

1. **Os componentes e ícones estão fiéis à documentação oficial do Mistica Web?**
   - Resposta: ___

2. **As boas práticas de acessibilidade, layout e semântica foram respeitadas?**
   - Resposta: ___

3. **Propriedades e componentes estão aderentes às especificações do Figma?**
   - Resposta: ___

Se alguma resposta for "não" ou "parcialmente", revise antes de entregar.

## Em Caso de Dúvida

Se houver incerteza sobre:
- **Propriedade de componente**: Consulte o arquivo de tipos `index.d.ts`
- **Token correto**: Consulte `mistica-tokens.md`
- **Workflow**: Revise `figma-workflow.md`
- **Restrições**: Consulte `restrictions.md`

# Validação com MCP Playwright

- Execute a skill `/playwright-cli` para validação final

## Entrega

Só entregue a implementação após confirmar **todos** os itens desta checklist.
