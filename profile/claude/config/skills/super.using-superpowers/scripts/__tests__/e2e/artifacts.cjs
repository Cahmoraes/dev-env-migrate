'use strict';
// Gera os artefatos do project-g (cache LRU+TTL) seguindo os TEMPLATES REAIS das skills.
// O objetivo e que artefato produzido no formato documentado passe nos validadores —
// se um template e um script divergirem, o e2e quebra aqui.
const FEATURE = 'lru-ttl-cache';
const DIR = `docs/superpowers/${FEATURE}`;

const spec = `# Design: Cache LRU com TTL

**Feature:** ${FEATURE}

## Visão Geral

Cache em memória de processo único com despejo LRU e expiração por TTL por entrada,
para uso interno de um serviço Node/TypeScript.

## Decisões Arquiteturais

- **Estrutura:** \`Map\` + lista duplamente ligada. O \`Map\` dá lookup O(1) e a lista
  dá promoção/despejo O(1). Trade-off: mais código que um array ordenado, mas o array
  degradaria para O(n) na promoção — inaceitável no \`get\`, que é o caminho quente.
- **Semântica de expiração vs miss:** uma entrada expirada conta como \`expiration\` E
  como \`miss\` no retorno (o chamador recebe \`undefined\`). Decisão registrada porque o
  brief admite ambiguidade — documentada, não deixada aberta.
- **Relógio:** injetado na construção (\`now: () => number\`), default \`Date.now\`.
  Fecha o requisito de teste determinístico sem tocar em \`setTimeout\`.
- **Interação TTL x LRU:** o \`get\` faz lazy-evict antes de promover; uma entrada
  expirada nunca é vítima de LRU porque já saiu da lista.

## Características

- \`set(key, value, ttlMs?)\`, \`get(key)\`, \`delete(key)\`, \`stats()\`
- capacidade fixa \`maxSize\`, TTL default configurável
- contadores cumulativos: hits, misses, evictions, expirations

## Riscos

- 🟡 Vazamento de entradas expiradas nunca lidas: aceito por ora (lazy-evict cobre o
  caminho de leitura); gatilho de revisão = memória do processo crescer sem hits.
`;

const prd = `# PRD: Cache LRU com TTL

## Visão Geral

Cache local de processo com despejo LRU e expiração por TTL.

## Objetivos

- Reduzir chamadas repetidas a recursos caros dentro de uma única instância do serviço.

## Histórias de Usuário

- **US-01** — Como desenvolvedor do serviço, eu quero armazenar valores com um TTL para que dados velhos não sejam servidos.
- **US-02** — Como desenvolvedor do serviço, eu quero que o cache respeite um limite de memória para que o processo não cresça sem controle.
- **US-03** — Como operador do serviço, eu quero ver contadores de hits e despejos para que eu possa dimensionar o cache.

## Funcionalidades Principais

- **FR-001**: \`set(key, value, ttlMs?)\` insere ou atualiza; sem \`ttlMs\` usa o TTL default da instância.
- **FR-002**: \`get(key)\` retorna o valor se presente e não expirado; entrada expirada é lazy-evicted no próprio \`get\`.
- **FR-003**: ao atingir \`maxSize\`, inserir nova chave despeja a entrada menos recentemente usada; \`get\` e \`set\` atualizam o uso.
- **FR-004**: \`delete(key)\` remove explicitamente e retorna \`true\`/\`false\` conforme existia.
- **FR-005**: \`stats()\` retorna hits, misses, evictions e expirations como contadores cumulativos distintos.
- **FR-006**: o relógio é injetável na construção, permitindo testes de TTL determinísticos sem \`setTimeout\`.

## Experiência do Usuário

API síncrona, sem I/O.

## Restrições Técnicas de Alto Nível

- Sem persistência, sem thread-safety, processo único.

## Fora de Escopo

- Cache distribuído, invalidação por evento, métricas exportadas.
`;

const tasksIndex = `# Tarefas: Cache LRU com TTL

**Spec:** \`../specs/${FEATURE}-design.md\`
**PRD:** \`../prd/prd-${FEATURE}.md\`

---

## Tarefas

- [ ] 1. Estrutura de dados e despejo LRU → \`task-01.md\`
- [ ] 2. Relógio injetável → \`task-02.md\`
- [ ] 3. set com TTL default → \`task-03.md\`
- [ ] 4. get com lazy-evict de expirados → \`task-04.md\`
- [ ] 5. delete e stats → \`task-05.md\`

## Foco de Revisão

- TTL zero ou negativo no set → entrada expira imediatamente, sem exceção → \`task-03\`
- get de chave inexistente → \`undefined\` explícito, sem lançar → \`task-04\`
`;

// O briefing que o controller escreve antes de despachar o writer: a secao `## Runner de testes`
// e a unica fonte das linhas `Run:` (o indice nao carrega mais o runner).
const taskWriterBriefing = `# Briefing do task writer: ${FEATURE}

## Runner de testes

- raiz · unit: \`npx vitest run <arquivo>\` (verificado: 1 arquivo coletado)

## Digest

- \`src/cache/\` e novo; relogio injetavel por construtor.

## Decomposicao

- task-01 Estrutura de dados e despejo LRU [FR-003]
- task-02 Relogio injetavel [FR-006]
- task-03 set com TTL default [FR-001]
- task-04 get com lazy-evict de expirados [FR-002]
- task-05 delete e stats [FR-004, FR-005]
`;

function taskFile({ n, title, frs, tier, consumes, creates = [], modifies = [], tests = [], skills }) {
  const frTag = frs.length ? ` [${frs.join(', ')}]` : '';
  const arquivos = [
    ...creates.map(f => `- Create: \`${f}\``),
    ...modifies.map(f => `- Modify: \`${f}\``),
    ...tests.map(f => `- Test: \`${f}\``),
  ].join('\n');
  return `# Task ${n}: ${title}${frTag}

**Status:** PENDING
**PRD:** \`../prd/prd-${FEATURE}.md\`
**Spec:** \`../specs/${FEATURE}-design.md\`
**Tier:** ${tier}

## Visão Geral

${title} conforme a Especificação e ${frs.join(', ') || 'o design'}.

## Arquivos

${arquivos}

## Interfaces

- **Consome:** ${consumes}
- **Produz:** N/A

### Skills a invocar

${skills.map(s => `- \`${s.name}\`: ${s.why}`).join('\n')}

## Passos

- **Step 1: Write the failing test**

\`\`\`ts
// ${tests[0] || 'test'}
it('descreve o comportamento de ${title.toLowerCase()}', () => {
  expect(true).toBe(false); // RED
});
\`\`\`

- **Step 2: Make it pass**

Implementa o mínimo em \`${creates[0] || modifies[0]}\` para o teste ficar verde.
${[3, 4].includes(n) ? `
- **Step 2b: Pin the implied input**

Review Focus: ${n === 3 ? 'TTL zero ou negativo no set → entrada expira imediatamente, sem exceção' : 'get de chave inexistente → undefined explícito, sem lançar'}

\`\`\`ts
it('cobre a entrada que a spec implica', () => { expect(() => f()).not.toThrow(); });
\`\`\`
` : ''}
- **Step 3: Refactor**

Remove duplicação mantendo a suíte verde.

## Critérios de Sucesso

${frs.map(fr => `- ${fr} verificável por teste automatizado`).join('\n') || '- comportamento coberto por teste'}
- Suíte da feature verde
`;
}

const TASKS = [
  { n: 1, title: 'Estrutura de dados e despejo LRU', frs: ['FR-003'], tier: 'standard', consumes: 'N/A',
    creates: ['src/cache/node-list.ts'], tests: ['src/cache/__tests__/node-list.test.ts'],
    skills: [{ name: 'typescript-advanced', why: 'tipos genéricos da lista ligada' }] },
  { n: 2, title: 'Relógio injetável', frs: ['FR-006'], tier: 'cheap', consumes: 'N/A',
    creates: ['src/cache/clock.ts'], tests: ['src/cache/__tests__/clock.test.ts'],
    skills: [{ name: 'typescript-advanced', why: 'assinatura do port de relógio' }] },
  { n: 3, title: 'set com TTL default', frs: ['FR-001'], tier: 'standard', consumes: '`NodeList<V>` (task-01), `Clock` (task-02)',
    creates: ['src/cache/lru-cache.ts'], tests: ['src/cache/__tests__/lru-cache.set.test.ts'],
    skills: [{ name: 'typescript-advanced', why: 'API pública tipada' }, { name: 'zod', why: 'validação das opções de construção' }] },
  { n: 4, title: 'get com lazy-evict de expirados', frs: ['FR-002'], tier: 'standard', consumes: '`LruCache.set(key, value, ttlMs?)` (task-03)',
    modifies: ['src/cache/lru-cache.ts'], tests: ['src/cache/__tests__/lru-cache.get.test.ts'],
    skills: [{ name: 'typescript-advanced', why: 'narrowing do retorno opcional' }] },
  { n: 5, title: 'delete e stats', frs: ['FR-004', 'FR-005'], tier: 'standard', consumes: '`LruCache.get(key)` (task-04)',
    modifies: ['src/cache/lru-cache.ts'], creates: ['src/cache/stats.ts'], tests: ['src/cache/__tests__/lru-cache.stats.test.ts'],
    skills: [{ name: 'typescript-advanced', why: 'tipo do objeto de contadores' }] },
];

module.exports = { FEATURE, DIR, spec, prd, tasksIndex, taskWriterBriefing, taskFile, TASKS };
