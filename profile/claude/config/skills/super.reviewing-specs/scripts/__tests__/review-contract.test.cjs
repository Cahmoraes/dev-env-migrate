'use strict';

/**
 * review-contract.test.cjs — textual contract of the reviewing-specs prose layer.
 *
 * The prose is the program: these guards pin the rules that the 2026-09 refinement added
 * after a planted-defect A/B showed Lens 1 blind to ambiguity-class defects (an unquantified
 * closure, a name drift, a scope contradiction, a lifecycle hole, an existing-rows gap) and
 * the apply step free to invent a closure the user never chose. Each assertion names the
 * layer that must carry the rule, because a rule that exists only in a reference the
 * controller may not reopen does not reach the turn that needs it.
 *
 * Never fix a red guard here by loosening it — update the prose it protects.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8');

const skill = read('SKILL.md');
const lenses = read('references/review-lenses.md');
const honest = read('references/honest-reporting.md');
const reviewer = read('agents/spec-reviewer.md');

function section(md, startHeading, endHeading) {
  const s = md.indexOf(startHeading);
  assert.ok(s >= 0, `heading not found: ${startHeading}`);
  const e = endHeading ? md.indexOf(endHeading, s + 1) : md.length;
  return md.slice(s, e < 0 ? md.length : e);
}

// ─── Lens 1: ambiguity-class probes live in the lens catalog ─────────────────

test('Lens 1 carries the one-way-to-build ambiguity probe with its tells', () => {
  const lens1 = section(lenses, '## Lens 1', '## Lens 2');
  assert.match(lens1, /two competent implementers build different things/i,
    'the ambiguity test is the question, not a word list — keep the question');
  for (const tell of ['adequado', 'algumas', 'TBD', 'passive voice']) {
    assert.ok(lens1.includes(tell), `ambiguity tell missing from Lens 1: ${tell}`);
  }
  assert.match(lens1, /retry with no count or ceiling/i, 'unquantified-parameter tell missing');
});

test('Lens 1 probes name drift, scope boundary, embedded assumptions', () => {
  const lens1 = section(lenses, '## Lens 1', '## Lens 2');
  assert.match(lens1, /One name per concept, one concept per name/);
  assert.match(lens1, /scope boundary is honored by the body/i);
  assert.match(lens1, /Fora de Escopo/);
  assert.match(lens1, /Assumptions about the outside are stated, not embedded/);
});

test('Lens 1 state family demands lifecycle completeness; data family demands a backfill', () => {
  const lens1 = section(lenses, '## Lens 1', '## Lens 2');
  assert.match(lens1, /lifecycle completeness/);
  assert.match(lens1, /state that exists only in a risk row is a hole/i);
  assert.match(lens1, /existing rows/);
  assert.match(lens1, /backfill/);
});

test('Lens 1 audits PRD requirements for verifiability when a PRD exists', () => {
  const lens1 = section(lenses, '## Lens 1', '## Lens 2');
  assert.match(lens1, /Requirements are verifiable, and are requirements/);
  assert.match(lens1, /acceptance criteria a test can assert/);
});

test('Lens 4 walks the flow step by step for an unhappy path', () => {
  const lens4 = section(lenses, '## Lens 4', '## Lens 5');
  assert.match(lens4, /Every flow step has an unhappy path/);
  assert.match(lens4, /times out, gets invalid input, is denied, half-succeeds, or races/);
});

test('the lead prompt carries the lens table with the ambiguity and unhappy-path angles (the lead reads the table, not the catalog)', () => {
  const lead = read('agents/review-lead.md');
  assert.match(lead, /closed \*unambiguously\*/, 'Lens 1 row must name the unambiguity angle');
  assert.match(lead, /an unhappy path for every flow step/, 'Lens 4 row must name the per-step unhappy path');
});

// ─── Kind: prose | decision — the apply step cannot invent a closure ─────────

test('the reviewer template emits a Kind field and defines both values', () => {
  const output = section(reviewer, '#### Findings', '#### Observação');
  assert.match(output, /\*\*Kind:\*\* prose \| decision/);
  assert.match(output, /Suggested fix MUST spell\s+out the closure/);
  assert.match(reviewer, /Severity\/Kind\/Section\/What/, 'Language section lists Kind among the labels');
});

test('the reviewer is told an ambiguous closure is an open fork, in the judging rules', () => {
  const judge = section(reviewer, '## How to judge', '## Output format');
  assert.match(judge, /only closed if it can be built ONE way/);
});

test('SKILL.md Step 3 carries the kind rule and the apply-all-as-proposed rule', () => {
  const step3 = section(skill, '## 3. Aggregate', '## 4. Apply');
  assert.match(step3, /kind visible: `prose` or `decision`/);
  assert.match(step3, /close \*as proposed\*/);
  assert.match(step3, /never a different one you now prefer/);
  assert.match(step3, /persist the findings left unapplied/,
    'apply-a-subset must offer the same persistence as save-to-adjust-later');
});

test('honest-reporting defines kind, separates it from severity, and names ambiguity a gap', () => {
  assert.match(honest, /the finding's kind/);
  assert.match(honest, /Kind is not severity/);
  assert.match(honest, /Ambiguity is a gap, not a style note/);
  assert.match(honest, /"Apply all" applies proposed closures as written/);
  const report = section(honest, '## Report structure', '## Consent');
  assert.match(report, /kind \(prose \| decision\)/, 'the Critical block lists kind as a field');
  assert.match(report, /decisions with a proposed closure/, 'the verdict counts decision findings');
});

// ─── Propagation: a fix applied to one restatement is a new contradiction ────

test('SKILL.md Step 4 requires propagating each fix to every restatement', () => {
  const step4 = section(skill, '## 4. Apply', '## 5. Offer');
  assert.match(step4, /Propagate each fix to every restatement/);
  assert.match(step4, /update every occurrence that restates the same fact/);
  assert.match(honest, /Edit surgically, then propagate/);
});

test('o controller despacha um lead capable e nada mais: o script rende o prompt do lead e o SKILL.md manda enviar dispatches[0] como emitido (haiku não despachou as lentes em 5/6; sonnet despachou, mas errou o model em 3/6)', () => {
  assert.ok(skill.includes('<super.reviewing-specs-base-dir>/scripts/build-review-lead-dispatch.cjs'), 'o SKILL.md roda o script do lead');
  assert.ok(skill.includes('--language <session language, e.g. pt-BR> --domain-expertise "<the spec\'s domain and stack>"'), 'o comando passa idioma e domínio ao script');
  assert.ok(skill.includes('**Send it as emitted, as your only dispatch**'), 'um despacho só, como emitido');
  assert.ok(skill.includes('`description`, `model` and `prompt` never retyped, never with `model:` dropped'), 'as formas de desvio medidas são nomeadas');
  assert.ok(skill.includes('The lead\'s prompt file, the lenses, their catalog and their prompt files are the lead\'s, never yours'), 'o procedimento (inclusive o prompt do lead) sai da mão do controller');
  assert.ok(skill.includes('A review you run instead of dispatching the lead is a skipped gate'), 'revisar inline é gate pulado');
  assert.ok(!skill.includes('The lenses (full catalog'), 'o catálogo de lentes não mora no SKILL.md');
  assert.ok(!/read `\.\/references\/review-lenses\.md`/.test(skill), 'o controller não é mandado ler o catálogo');
  assert.ok(!skill.includes('build-review-dispatch.cjs'), 'o manifesto das lentes é do lead');
  const send = skill.indexOf('**Send it as emitted, as your only dispatch**');
  assert.ok(send > 0 && send < skill.indexOf('## 3. Aggregate'), 'o envio vem antes do passo 3');
});

test('o lead despacha as lentes como emitidas, declara quando não pode despachar e devolve só o veredito', () => {
  const lead = read('agents/review-lead.md');
  assert.ok(lead.includes('Send every entry as emitted, one dispatch per entry, all in the same turn'));
  assert.ok(lead.includes('never retyped, never with `model:` dropped, never rebuilt by hand from the lens catalog'));
  assert.ok(lead.includes('A `valid: true` manifest whose entries are not sent is a skipped gate'));
  assert.ok(lead.includes('`Lenses: sequential (no dispatch available)`'), 'degradação declarada, nunca escondida');
  assert.ok(lead.includes('never ask a question'), 'o lead não alcança o usuário');
  assert.ok(lead.includes('Never paste the report body into the return'), 'o corpo do relatório fica no arquivo');
  assert.ok(lead.includes('Do not add findings of your own'), 'o lead ranqueia, não inventa');
  assert.ok(skill.includes('`Lenses: sequential (no dispatch available)`'), 'o controller repassa a degradação ao usuário');
});

test('o lead encerra o turno em vez de construir espera: a plataforma reinvoca (um loop de shell inventado rodou 558 s, reportou n=0 e as lentes já tinham terminado 3 min antes)', () => {
  const lead = read('agents/review-lead.md');
  // "Await every return" era a redação anterior: dentro de um subagente ela lê como
  // "construa um mecanismo de espera", e foi o que aconteceu — ToolSearch + Monitor +
  // um `while ... sleep 20` sobre os .output dos filhos, que nem casavam o padrão buscado.
  assert.ok(!/Await every return/.test(lead), 'a redação vaga que produziu o loop não pode voltar');
  assert.ok(lead.includes('END YOUR TURN'), 'o procedimento diz o que fazer: encerrar o turno');
  // Os três tokens canônicos (`schedule a wakeup/timer`, `re-invokes you`,
  // `busy-polling harness-tracked`) têm um dono só: await-not-poll.test.cjs, que agora
  // enumera este arquivo. Aqui ficam apenas as formas que ESTE fluxo produziu.
  assert.ok(
    /build any wait of your own/.test(lead),
    'a proibição precisa nomear o ato — construir a própria espera',
  );
  assert.ok(
    /cannot observe them anyway/.test(lead),
    'a razão é o que faz a regra pegar: a espera construída não observa os filhos',
  );
  // A proibição não pode virar beco sem saída onde o harness não reinvoca (Copilot CLI
  // não acorda o orquestrador: a tradução dele é dispatch bloqueante / read_agent). O lead
  // é mandado à referência da plataforma primeiro, e só depois ao fallback por trechos.
  assert.ok(
    /<platform>-tools\.md/.test(lead),
    'a tradução por plataforma tem um dono: a referência de tools daquele harness',
  );
  assert.ok(
    /bounded stretches of five to ten minutes/.test(lead),
    'o último recurso, para uma plataforma sem reinvocação E sem primitiva de coleta',
  );
});
