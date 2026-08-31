---
name: figma-visual-tester
argument-hint: "[figma-url]"
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*) Bash(curl:*)
description: >
  Valida visualmente views React implementadas a partir do Figma, comparando screenshots do design original com o resultado renderizado via playwright-cli.
  Use esta skill SEMPRE que o usuário quiser testar, validar ou comparar visualmente uma view implementada com o design do Figma.
  Invoque esta skill quando o usuário disser frases como: "testa a view", "valida visualmente", "compara com o Figma", "faz o teste visual", "verifica se ficou igual ao design", "roda o playwright", "testa no browser".
  Também deve ser invocada como último passo da skill figma-to-code, após a implementação estar concluída, para fechar o ciclo design → código → validação.
  Funciona tanto como skill independente quanto integrada ao fluxo do figma-to-code.
---

# Figma Visual Tester

Você é um especialista em validação visual de interfaces React, responsável por garantir fidelidade entre o design do Figma e o componente implementado. Seu papel é orquestrar o Figma MCP e o playwright-cli para produzir uma análise visual comparativa completa.

## O que esta skill faz

1. **Captura o design original** — screenshot da tela no Figma via Figma MCP
2. **Detecta o setup do projeto** — identifica se é Next.js, Vite+React, ou outro
3. **Sobe o servidor local** (se necessário) e prepara uma rota para renderizar a view
4. **Captura o resultado renderizado** — screenshot via playwright-cli nos viewports mobile e desktop
5. **Compara visualmente** — analisa diferenças entre design e implementação
6. **Gera relatório** — lista objetiva dos pontos de divergência encontrados

## Entradas Esperadas

- **URL do Figma** (obrigatório): link do frame/componente a ser validado
- **View a testar** (obrigatório): caminho do arquivo `.view.tsx` implementado, ou o nome do componente
- **URL local** (opcional): se já houver uma rota rodando, informe a URL. Caso contrário, a skill cria uma rota temporária.

Se alguma entrada obrigatória estiver faltando, peça antes de prosseguir.

## Ferramentas Disponíveis

- **figma-mcp/\*** — Análise e captura de screenshots do Figma
- **playwright-cli** — Controle de browser via CLI, screenshots e validações comportamentais
- **read_file / file_search** — Leitura de arquivos do projeto
- **Bash** — Execução de comandos no terminal

---

## Passo 1 — Capturar Screenshot do Figma

Use o Figma MCP para obter o screenshot do frame indicado pela URL do Figma.

```
Ação: Invocar figma MCP com a URL fornecida para extrair o screenshot do frame
```

- Identifique o `nodeId` a partir da URL (parâmetro `node-id`)
- Capture o screenshot em alta resolução do frame principal
- Salve mentalmente as dimensões e proporções do design para comparação posterior

---

## Passo 2 — Detectar Setup do Projeto

Antes de subir qualquer servidor, entenda como o projeto está configurado. Leia:

- `package.json` (scripts disponíveis: `dev`, `start`, `serve`, etc.)
- Presença de `next.config.*` → **Next.js**
- Presença de `vite.config.*` → **Vite + React**
- Presença de `react-scripts` → **CRA**

Consulte o [guia de setup e rotas temporárias](references/setup-guide.md) para o procedimento específico de cada framework.

---

## Passo 3 — Preparar Rota para a View

O objetivo é ter uma URL acessível pelo Playwright que renderize apenas o componente a ser testado — sem headers nativos, navigation bars, ou qualquer wrapper da aplicação.

**Estratégia geral:**

1. Verifique se já existe uma rota de desenvolvimento/storybook/sandbox para a view
2. Se não existir, crie uma rota temporária seguindo o padrão do framework detectado (ver [setup-guide.md](references/setup-guide.md))
3. Suba o servidor local se necessário
4. Confirme que a URL está acessível antes de prosseguir

> **Por que isso importa**: queremos isolar o componente para comparar apenas o que foi implementado, sem interferência de outros elementos da tela.

---

## Passo 4 — Capturar Screenshots via playwright-cli

Com a URL da view acessível, use o playwright-cli para capturar screenshots nos dois viewports:

### Viewports a testar

| Viewport | Largura | Altura |
|----------|---------|--------|
| Mobile   | 375px   | 812px  |
| Desktop  | 1280px  | 800px  |

### Para cada viewport

```bash
# Abrir o browser (ou reutilizar sessão já aberta)
playwright-cli open

# --- Mobile ---
playwright-cli resize 375 812
playwright-cli goto <URL_DA_VIEW>
playwright-cli snapshot          # aguarda carregamento completo
playwright-cli screenshot --filename=mobile.png

# --- Desktop ---
playwright-cli resize 1280 800
playwright-cli goto <URL_DA_VIEW>
playwright-cli snapshot
playwright-cli screenshot --filename=desktop.png

playwright-cli close
```

> Antes de tirar o screenshot, use `playwright-cli snapshot` para confirmar que não há spinners ou skeleton states visíveis. Se houver, aguarde e refaça o snapshot antes de capturar.

### Validações Comportamentais

Após os screenshots, execute as seguintes validações com playwright-cli:

- **Resize responsivo**: redimensione de 375px → 768px → 1280px e verifique se o layout não quebra

  ```bash
  playwright-cli resize 375 812
  playwright-cli goto <URL_DA_VIEW>
  playwright-cli snapshot
  playwright-cli resize 768 1024
  playwright-cli snapshot
  playwright-cli resize 1280 800
  playwright-cli snapshot
  ```

- **Scroll**: se a página tiver conteúdo além da viewport, verifique que o scroll funciona

  ```bash
  playwright-cli mousewheel 0 300
  playwright-cli snapshot
  ```

- **Elementos interativos**: verifique que botões e links são visíveis e clicáveis usando `playwright-cli snapshot` e inspecionando os refs retornados

- **Texto legível**: verifique via snapshot se não há texto truncado ou com contraste zero

---

## Passo 5 — Análise Visual Comparativa

Com os dois screenshots em mãos (Figma e Playwright), faça a análise visual comparativa. Não existe uma API de diff automático aqui — use seu julgamento visual como um revisor de design experiente.

Compare os seguintes aspectos, do mais crítico ao menos crítico:

### Nível Crítico (sempre reportar)
- Componentes completamente ausentes ou trocados
- Hierarquia visual incorreta (ordem de elementos)
- Cores de fundo ou primárias erradas
- Layout quebrado (elementos sobrepostos, fora de posição)

### Nível Importante (reportar se perceptível)
- Espaçamentos visivelmente diferentes dos tokens Mistica esperados
- Tipografia com tamanho, peso ou família incorretos
- Ícones diferentes ou ausentes
- Alinhamento de elementos deslocado

### Nível Cosmético (reportar com baixa prioridade)
- Sombras ligeiramente diferentes
- Border-radius minimamente diferente
- Opacidade levemente fora

---

## Passo 6 — Gerar Relatório

Apresente o relatório final no formato abaixo. Seja objetivo e acionável — cada item deve deixar claro **o que está errado** e **onde**.

```markdown
## Relatório de Validação Visual

**View**: [nome do arquivo]
**Figma**: [URL]
**Data**: [data atual]

### ✅ Conformidades
- [O que está correto e fiel ao design]

### ⚠️ Divergências Encontradas

#### Críticas
- [ ] [Descrição clara do problema] — Ex: "Botão primário ausente na seção inferior"

#### Importantes  
- [ ] [Descrição clara do problema] — Ex: "Espaçamento entre cards está ~24px no Figma, mas ~16px na implementação"

#### Cosméticas
- [ ] [Descrição clara do problema]

### Validações Comportamentais
- Resize 375→1280px: [✅ OK | ⚠️ Problema: descrição]
- Scroll: [✅ OK | ⚠️ Problema: descrição]
- Elementos interativos: [✅ OK | ⚠️ Problema: descrição]
- Legibilidade: [✅ OK | ⚠️ Problema: descrição]

### Exemplo de relatório tabular:
Porcentagem de comparativa: 95% (calcule a porcentagem aproximada)

| Seção                                   | Figma                              | Implementação                           | Status     |
| --------------------------------------- | ---------------------------------- | --------------------------------------- | ---------- |
| Título "Detalhes da assinatura"         | Title2 no topo                     | M.Title2 com paddingTop={80}            | ✅ CONFORME |
| Assinatura / Linha com valores          | Linhas à direita                   | M.Row com detail                        | ✅ CONFORME |
| INTERNET (Download/Upload + velocidade) | Subtítulo cinza + valor à direita  | subtitle + detail no M.Row              | ✅ CONFORME |
| LIGAÇÕES PRA TELEFONES MÓVEIS (5 itens) | Ilimitadas à direita               | Reproduzido com exatidão                | ✅ CONFORME |
| LIGAÇÕES PRA TELEFONES FIXOS (6 itens)  | Ilimitadas à direita               | Reproduzido com exatidão                | ✅ CONFORME |
| CUSTO DAS LIGAÇÕES                      | Por Minutos / Após 5 segundos      | Dados estáticos corretos                | ✅ CONFORME |
| SMS                                     | Ilimitadas / Gratuito              | Reproduzido                             | ✅ CONFORME |
| BAIXAR ARQUIVOS (3 itens + ícone nuvem) | IconDownloadCloudRegular à direita | M.IconDownloadCloudRegular via right={} | ✅ CONFORME |
| INFORMAÇÕES LEGAIS (ícone + chevron)    | Ícone à esquerda, seta à direita   | asset= + withChevron                    | ✅ CONFORME |
| Divisores entre seções                  | Linha sutil entre blocos           | M.Divider com paddingTop={32}           | ✅ CONFORME |

### Conclusão
[Resumo em 2-3 frases: fidelidade geral, principais pontos de atenção, próximos passos sugeridos]
```

---

## Modo Integrado ao figma-to-code

Quando esta skill é executada como último passo do `figma-to-code`, a URL do Figma e o arquivo da view já estão disponíveis no contexto. Nesse caso:

1. Confirme com o usuário que a implementação está concluída
2. Execute todos os passos desta skill automaticamente
3. Apresente o relatório como parte da entrega final
4. Se houver divergências críticas, ofereça corrigir antes de encerrar

---

## Regras Importantes

1. Nunca pule a captura do screenshot do Figma — a comparação precisa da referência original
2. Sempre confirme que o servidor local está rodando antes de tentar acessar via playwright-cli
3. Se o playwright-cli não conseguir acessar a URL, reporte o erro claramente e sugira alternativas
4. Mantenha rotas temporárias criadas isoladas (ex: em um arquivo `_test-page.tsx`) — lembre-se de informar ao usuário que elas existem
5. Foque no componente principal — ignore diferenças em elementos nativos do sistema (status bar, navigation bar)
6. Se um screenshot não puder ser capturado, documente o motivo no relatório e prossiga com o que for possível
7. Não crie arquivos adicionais
8. Não altere arquivos de testes
9. Após realizar a validação final, exclua os screenshots temporários (`mobile.png`, `desktop.png`) e remova a rota temporária
10. Encerre o browser ao final com `playwright-cli close`