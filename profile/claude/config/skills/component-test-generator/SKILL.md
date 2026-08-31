---
name: component-test-generator
argument-hint: "[US] [Controller/módulo] + critérios de aceite + tabela de mapeamento"
allowed-tools: Bash(npm:*) Bash(npx:*) Bash(cypress:*) Grep Glob
description: "Use SEMPRE que o usuário quiser criar, gerar ou escrever testes de componente Cypress (Cucumber/Gherkin em PT-BR), arquivos `.feature`/`.cy.tsx`, casos de teste (CT001, CT002...), ou testar um Controller/View a partir de critérios de aceite (CA001, CA002...). Invoque quando o usuário disser frases como: \"cria os testes de componente dessa US\", \"gera o CT desses critérios de aceite\", \"transforma esses CAs em teste Cypress\", \"escreve o .feature e o .cy.tsx\", \"mapeia esses critérios em casos de teste\", \"testa esse controller com esses critérios\"."
---

# Component Test Generator

Você transforma **critérios de aceite** (formato CA001, CA002...) e uma **tabela de mapeamento CA → CT** em testes de componente Cypress escritos em Gherkin (Cucumber) PT-BR, fiéis aos padrões já existentes no projeto. Ao final, executa os testes.

O valor da skill está na fidelidade: os arquivos gerados devem ser indistinguíveis dos que um humano do time escreveria. Por isso você **sempre** parte dos exemplos reais da codebase e dos `data-testid` que as views realmente expõem — nunca inventa seletores.

## Entradas esperadas

O usuário fornece três coisas (se faltar alguma, peça antes de gerar):

1. **US (bounded context de teste)** — o diretório-pai, ex.: `PTIECSUB-001`, `PTIECCD-001`.
2. **Controller/módulo** — qual Controller a US exercita, ex.: `SubscriptionController` do módulo `subscription`. O usuário informa; se estiver ambíguo, confirme.
3. **Critérios de aceite** — bloco no formato:
   ```
   CA001* - Acesso ao detalhe
   Dado que o cliente visualiza uma assinatura Pós no 1º nível
   Quando clicar no card da assinatura
   Então deverá ser direcionado para a tela de detalhe da assinatura.
   ```
4. **Tabela de mapeamento (livre)** — colunas `US | CT | CAs | descrição`, ex.:

   | US | CT | CAs cobertos | Descrição |
   |----|----|--------------|-----------|
   | PTIECSUB-001 | CT001 | CA001, CA002 | Acesso e exibição da assinatura |
   | PTIECSUB-001 | CT002 | CA011, CA012 | Resiliência a APIs indisponíveis |

   Cada linha da tabela vira **uma pasta CT** com um `.feature` + um `.cy.tsx`. Um CT pode cobrir vários CAs — nesse caso, cada CA vira um `Scenario` (ou um par Given/Then) dentro do mesmo `.feature`.

## Fluxo de trabalho

Siga esta ordem. Não pule a etapa de descoberta — ela é o que garante que os testes passem.

### 1. Localizar o alvo e estudar os vizinhos

O diretório-alvo é **sempre** `tests/components/src/pages/<US>/<CT>/`. Antes de escrever qualquer coisa, leia 1-2 CTs já existentes (na mesma US, se houver, senão em outra US) para calibrar o estilo exato de indentação, imports e boilerplate de `mount`. Os padrões canônicos estão em `references/templates.md` — leia esse arquivo agora se ainda não leu.

### 2. Descobrir o Controller e os `data-testid` reais

Os asserts do `.cy.tsx` dependem dos `data-testid` que a View realmente renderiza. Descubra-os na codebase (não invente):

```bash
# localizar o controller informado
find src -path "*presentation/controller/*<modulo>*-controller.tsx"
# listar os testId expostos pelo módulo
grep -rn "testId\s*=\|testID=" src/<modulo>/presentation
```

Anote o `data-testid` da view raiz (ex.: `subscription-controller` expõe `postpaid-view` / `control-view` / `prepaid-view`) e os das seções relevantes para cada CA (ex.: `mobile-internet-section`, `benefits-section`). Cada CA deve ancorar seu `Então` em um `data-testid` concreto ou num comportamento verificável (visibilidade, contagem, texto, interação).

Descubra também qual `DEPENDENCIES.*` e qual gateway `*GatewayMemory` o módulo usa (veja o `.cy.tsx` vizinho ou `src/<modulo>/infra`). O bloco `provide([...])` do `Before` deve registrar exatamente esses.

### 3. Gerar o `.feature` (Gherkin PT-BR)

Um arquivo por CT, nomeado `CTxxx.feature`. Regras de estilo (extraídas dos exemplos reais):

- `Feature: CTxxx - <título curto em inglês do componente>` (mantém o padrão dos vizinhos).
- Indentação com **2 espaços** por nível (`Scenario`, `Given/When/Then`).
- Passos em **PT-BR**: `Dado`/`Given`, `Quando`/`When`, `Então`/`Then`, `E`/`And`. Siga o idioma dos vizinhos — os exemplos atuais usam palavras-chave em inglês (`Given`, `Then`, `And`) com texto em PT-BR. Mantenha essa convenção salvo indicação em contrário.
- Cada CA da tabela vira um `Scenario` (quando o CT cobre múltiplos CAs distintos) ou passos `And` adicionais (quando compõem o mesmo fluxo).
- O texto do passo `Então` deve refletir o critério e casar com o step definido no `.cy.tsx`.

### 4. Gerar o `.cy.tsx`

Um arquivo por CT, nomeado `CTxxx.cy.tsx`. **Copie o boilerplate de `references/templates.md`** e ajuste apenas: módulo/Controller importado, `DEPENDENCIES.*`, gateway memory, `initialEntries` da rota, e os steps `Given/Then` (textos idênticos aos do `.feature`).

Pontos inegociáveis (quebram o teste se ignorados):
- Imports com alias `@/` e o `i18n` via caminho relativo `../../../../../../src/shared/infra/i18n/i18n` (a profundidade depende do nível — confira contra um vizinho).
- `Before(() => provide([...]))` registrando o gateway memory e os adapters (`StorageMemoryAdapter`, `BroadcastMemoryAdapter`, etc.) que o módulo exige.
- `i18n.changeLanguage("pt")` dentro do `Given`.
- `mount(...)` envolto por `ThemeContextProvider theme={theme}` → `I18nextProvider` → `QueryClientProvider client={setupQueryClient()}` → `MemoryRouter initialEntries={[...]}` → `<Controller />`.
- Asserts via `cy.get('[data-testid="..."]', { timeout: 10000 })` usando os testId **descobertos na etapa 2**.
- Formatação Biome do projeto (tabs? o Cypress config usa tabs, mas os `.cy.tsx` existentes usam 2 espaços — siga o arquivo vizinho).

### 5. Executar os testes

Rode sempre ao final e reporte o resultado:

```bash
npm run test:component
```

Se o CT envolver snapshot visual (`matchImageSnapshot` / `.snap.png`) e for a primeira geração, gere a baseline:

```bash
npm run test:component:update-snapshot
```

Se algum teste falhar, leia a saída, ajuste o seletor/step (geralmente um `data-testid` errado ou timeout curto) e rode de novo até passar. Não conclua com teste vermelho.

## Exemplo de mapeamento CA → arquivos

**Entrada (linha da tabela):** `PTIECSUB-001 | CT001 | CA001, CA002 | Acesso e exibição`

**Saída:**
```
tests/components/src/pages/PTIECSUB-001/CT001/
├── CT001.feature   # Scenario com Given (mount) + Then por CA001/CA002
└── CT001.cy.tsx    # Before(provide), Given(mount SubscriptionController), Then(asserts em data-testid)
```

## Checklist antes de concluir

- [ ] Uma pasta `CTxxx/` por linha da tabela, com `.feature` + `.cy.tsx`.
- [ ] Todos os `data-testid` usados existem de fato na codebase (verificados por grep).
- [ ] `provide([...])` registra os gateways/adapters corretos do módulo.
- [ ] `.feature` e `.cy.tsx` têm textos de step idênticos.
- [ ] `npm run test:component` passa (e snapshot gerado quando aplicável).

Detalhes completos de boilerplate e variações por módulo: `references/templates.md`.
