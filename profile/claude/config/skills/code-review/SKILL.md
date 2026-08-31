---
name: code-review
description: "Use quando o usuário pedir code review, revisão de código, análise de PR ou qualidade de código em React, TypeScript, Node.js ou JavaScript, ou com sinais implícitos: \"tá certo?\", \"tem algo bloqueante?\", \"posso subir/commitar?\", \"segunda opinião antes do merge\", \"vai reprovar no code review?\". NÃO use para dúvidas educacionais, criar código, refatorar, corrigir bugs, explicar código ou gerar tipos/testes."
argument-hint: "[file-path] [format-style]"
---

## Escopo

- Avalia apenas arquivos no diretório `./src/*`
- **NÃO revise**: `*.test.ts`, `*.spec.ts`, `*.md`, `*.json`, `*.stories.*`, `*.config.js`
- Se `$file-path` não for fornecido, faça a revisão do código aberto no editor.
- Se `$file-path` for igual a "*", faça a revisão de todos os arquivos em staging. Execute um #runSubagent para cada arquivo ser revisado em paralelo.
- Se `$format-style` for definido para `cli`, formate a saída para ser exibida em `command-line interfaces`. Removendo formatações válidas de markdown mas formatando para `cli`. 


## Contexto Arquitetural

Aplicação web moderna, modular e responsiva, voltada para execução em webviews móveis.

**Stack**: React, TypeScript, Node.js, Jest, React Testing Library, Cypress (BDD), React Query, Zod, Webpack, Module Federation

**Design System**: Mistica (Telefónica)

**Internacionalização**: `react-i18next`

**Componentização**:
- `.controller.tsx`: lógica de negócio, APIs, formulários (React Hook Form + Zod), sem visual
- `.view.tsx`: apenas layout, visual, Skeletons e animações; recebe dados via props

## Diretrizes de Revisão

As diretrizes são aplicadas durante o **Workflow de Revisão** abaixo, onde cada subagent é executado uma única vez com sua referência correspondente.

## Workflow de Revisão

1. **Identifique o código a revisar**: arquivo aberto, seleção, PR ou staging
2. **Filtre pelo escopo**: apenas `./src/*`, excluir testes/configs/stories
3. **Execute a revisão por subagents**, em ordem:
  - `#runSubagent` internationalization-reviewer → `references/internationalization.md`
  - `#runSubagent` performance-reviewer → `references/performance.md`
  - `#runSubagent` storage-review → `references/local-storage.md`
  - `#runSubagent` redirect-review →`references/redirects.md`
  - `#runSubagent` security-reviewer → `references/security.md`
  - `#runSubagent` legibility-review → `references/legibility.md`
  - `#runSubagent` structure-review → `references/structure.md`
4. **Compile o relatório** no formato padronizado abaixo
5. **Valide** antes de entregar: problemas são reais? Sugestões estão alinhadas?

## Classificação de Violações

| Categoria | Significado |
|---|---|
| **BLOQUEANTE** | Impede aprovação da PR. Exige acordo do gerente ou débito técnico aberto no Jira |
| **NÃO BLOQUEANTE** | Permite aprovação, desde que registrado débito técnico no Jira |
| **RECOMENDADO** | Práticas recomendadas, exigidas em code review, mas não barram o merge |

## Formato do Relatório
    A revisão será apresentada em formato Markdown estruturado, adequado para comentários em Pull Requests:

    Estrutura da Resposta Esperada
    Cada item deve seguir esta estrutura:
    **Diretriz Violada:** [Nome da Diretriz]
    **Categoria** BLOQUEANTE | NÃO BLOQUEANTE | RECOMENDADO
    **Descrição do Problema:** [Explicação clara e objetiva]  
    **Sugestão de Correção:** [Proposta objetiva e aderente ao padrão do projeto]
    ---

    Exemplo:

    **Diretriz Violada:** Acoplamento nas Tipagens do React  
    **Categoria** NÃO BLOQUEANTE
    **Descrição do Problema:** Uso direto de `React.Dispatch` e `React.SetStateAction` acopla a lógica ao hook nativo.  
    **Sugestão de Correção:** Encapsule essas funções em handlers nomeados, exportados como funções puras e sem dependência direta de `useState`.
    ---

    ### Sobre as Categoria BLOQUEANTE | NÃO BLOQUEANTE | RECOMENDADO
    **Bloqueante**: impede aprovação da PR (exige acordo do gerente ou débito técnico aberto no Jira).

    **Não bloqueante**: permite aprovação, desde que registrado débito técnico no Jira.

    **Recomendado**: práticas recomendadas, exigidas em code review, mas não barram o merge.
---
```

### Quando nenhuma violação for encontrada

```markdown
Nenhuma violação foi identificada. O código segue as diretrizes estabelecidas.
---
```

### Quando o código estiver incompleto

```markdown
Não foi possível revisar adequadamente o código. O trecho está incompleto ou depende de contexto externo (ex: props, imports ou tipagens não fornecidas).
---
```

## Regras Críticas

1. A revisão deve ser clara, direta e objetiva
2. Foque apenas nos problemas reais — sem sugestões inventadas
3. Seja sucinto quando o código estiver adequado
4. Nomeie explicitamente a diretriz associada a cada violação
5. Reavalie sempre se há algo não evidenciado
6. Mantenha alto padrão técnico na resposta
7. Não forneça feedbacks irrelevantes como "Observações Positivas"
8. Antes de finalizar, valide: estrutura segue o modelo? Problemas são reais? Sugestões alinhadas?
