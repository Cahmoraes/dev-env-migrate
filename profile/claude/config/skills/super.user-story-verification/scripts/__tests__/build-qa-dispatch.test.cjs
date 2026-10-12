'use strict';

// Tests build-qa-dispatch.cjs — emits one ready-to-send QA subagent dispatch per
// user story, with `model:` resolved from preferences and pinned to the `standard`
// tier. Each story's fully rendered prompt is written to a file under `--prompt-dir`;
// the dispatch entry itself carries only `description`/`model`/`promptFile`/`prompt`
// (a short pointer), never the rendered text. Mirrors
// super.reviewing-specs/scripts/__tests__/build-review-dispatch.test.cjs.
//
// Run: node --test super.user-story-verification/scripts/__tests__/build-qa-dispatch.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'build-qa-dispatch.cjs');
const GENERATE_SLUGS = path.resolve(__dirname, '..', 'generate-slugs.cjs');
const PRD_FIXTURE = path.resolve(__dirname, 'fixtures', 'prd-greeting-suffix.md');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-dispatch-'));
}

function writePrefs(root, yaml) {
  fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yaml, 'utf8');
}

function generateSlugs(prdPath) {
  const out = execFileSync('node', [GENERATE_SLUGS, '--prd', prdPath], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

// A minimal synthetic slugs payload for tests that don't need the real PRD shape.
function syntheticSlugs(overrides = {}) {
  return {
    count: 1,
    requirementsMapped: true,
    warnings: [],
    userStories: [
      {
        id: 'US-01',
        text: 'Como usuário, eu quero X para que Y',
        role: 'usuário',
        want: 'X',
        benefit: 'Y',
        slug: 'us-01-x',
        requirements: ['FR-001'],
        uiFacing: false,
      },
    ],
    ...overrides,
  };
}

const BASE_ARGS = {
  '--feature-name': 'greeting-suffix',
  '--prd': 'docs/superpowers/greeting-suffix/prd/prd-greeting-suffix.md',
  '--test-runner': 'npx vitest run <file>',
  '--browser': 'not available',
  '--language': 'pt-BR',
};

function toArgs(map) {
  return Object.entries(map).flatMap(([k, v]) => [k, v]);
}

// `omitPromptDir: true` skips the helper's default --prompt-dir (used only by the test
// that specifically exercises mkdtemp-per-invocation). Every other test gets a
// --prompt-dir inside `root`, so `withRepo`'s cleanup covers the written prompt files.
function run(root, slugsData, extra = {}, opts = {}) {
  const { expectFailure = false, omitPromptDir = false } = opts;
  const slugsPath = path.join(root, 'slugs.json');
  fs.writeFileSync(slugsPath, JSON.stringify(slugsData), 'utf8');
  const merged = { ...BASE_ARGS, ...extra };
  if (!omitPromptDir && !merged['--prompt-dir']) {
    merged['--prompt-dir'] = path.join(root, 'prompts');
  }
  const args = [
    SCRIPT,
    '--slugs', slugsPath,
    '--repo-root', root,
    ...toArgs(merged),
  ];
  if (expectFailure) {
    try {
      execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      throw new Error('expected the script to exit non-zero');
    } catch (err) {
      if (err.status === undefined) throw err;
      return { status: err.status, stderr: err.stderr, stdout: err.stdout };
    }
  }
  const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: 0, json: JSON.parse(out) };
}

function withRepo(fn) {
  const root = mkRepo();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ─── 1. Real PRD fixture through the real generate-slugs.cjs ──────────────────────

test('one dispatch per story, real PRD shape, model from preferences, no placeholders left', () => {
  withRepo((root) => {
    writePrefs(root, 'model_tiers:\n  standard: sonnet\n');
    const slugs = generateSlugs(PRD_FIXTURE);
    assert.ok(slugs.userStories.length >= 2, 'fixture PRD has at least 2 stories');
    const { json } = run(root, slugs);

    assert.equal(json.model, 'sonnet');
    assert.equal(json.tier, 'standard');
    assert.equal(json.storyCount, slugs.userStories.length);
    assert.equal(json.dispatches.length, slugs.userStories.length);

    for (const [i, dispatch] of json.dispatches.entries()) {
      const story = slugs.userStories[i];
      const body = fs.readFileSync(dispatch.promptFile, 'utf8');
      assert.equal(dispatch.usId, story.id);
      assert.equal(dispatch.slug, story.slug);
      assert.equal(dispatch.model, 'sonnet');
      assert.ok(dispatch.evidenceDir.includes(story.slug));
      assert.ok(!/\{[A-Z_]+\}/.test(body), `${story.id} has no leftover placeholder`);
      assert.ok(!/<super\.[a-z-]+-base-dir>/.test(body), `${story.id} has no leftover base-dir token`);
      assert.ok(body.includes(story.text), `${story.id} body carries the story text`);
      if (story.requirements.length > 0) {
        assert.ok(body.includes(story.requirements.join(', ')));
      }
    }
  });
});

// ─── 2. No preferences file → model auto ───────────────────────────────────────────

test('no preferences file => model "auto"', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs());
    assert.equal(json.model, 'auto');
    assert.deepEqual(json.unavailable, []);
    assert.equal(json.dispatches[0].model, 'auto');
  });
});

// ─── 3. Foreign model for the platform => platform rung + unavailable ─────────────

test('a standard model the platform cannot serve falls back to the platform rung, with a non-empty unavailable', () => {
  withRepo((root) => {
    // gpt-5 confidently classifies as "openai" in lib/model-tiers.cjs; claude-code only
    // serves "anthropic". What replaces it is that platform's own `standard` rung alias —
    // never "auto", which is not a value any dispatch tool accepts.
    writePrefs(root, 'model_tiers:\n  standard: gpt-5\n');
    const { json } = run(root, syntheticSlugs(), { '--platform': 'claude-code' });
    assert.equal(json.model, 'sonnet');
    assert.ok(json.unavailable.length >= 1);
    assert.equal(json.unavailable[0].tier, 'standard');
    assert.equal(json.unavailable[0].configured, 'gpt-5');
  });
});

// ─── 4b. The subagent locates the tests itself ─────────────────────────────────────

test('the prompt tells the subagent to locate the tests itself', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs());
    const body = fs.readFileSync(json.dispatches[0].promptFile, 'utf8');
    assert.match(body, /Locate the tests yourself/);
  });
});

// ─── 6. Empty requirements => "none mapped" text ───────────────────────────────────

test('empty requirements render the "none mapped" fallback text', () => {
  withRepo((root) => {
    const slugs = syntheticSlugs({
      userStories: [{
        id: 'US-01', text: 'Como X, eu quero Y para que Z', role: 'X', want: 'Y', benefit: 'Z',
        slug: 'us-01-y', requirements: [], uiFacing: null,
      }],
    });
    const { json } = run(root, slugs);
    const body = fs.readFileSync(json.dispatches[0].promptFile, 'utf8');
    assert.ok(body.includes(
      'none mapped by the PRD — derive them from its Requisitos Funcionais and say in notes that you derived them',
    ));
  });
});

// ─── 7. --only filters; unknown id errors ──────────────────────────────────────────

test('--only <id> keeps exactly one dispatch; an unknown id exits 1', () => {
  withRepo((root) => {
    const slugs = generateSlugs(PRD_FIXTURE);
    const secondId = slugs.userStories[1].id;
    const { json } = run(root, slugs, { '--only': secondId });
    assert.equal(json.dispatches.length, 1);
    assert.equal(json.storyCount, slugs.userStories.length, 'storyCount is the PRD total Step 5 reconciles against, not the selection');
    assert.equal(json.dispatches[0].usId, secondId);

    const { status, stderr } = run(root, slugs, { '--only': 'US-999' }, { expectFailure: true });
    assert.equal(status, 1);
    assert.match(stderr, /US-999/);
  });
});

// ─── 8. Base-dir resolves to a real path on disk ───────────────────────────────────

test('the rendered <super.user-story-verification-base-dir> token resolves to a real directory', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs());
    const body = fs.readFileSync(json.dispatches[0].promptFile, 'utf8');
    const m = body.match(/node (\S+)\/scripts\/setup-qa-tsconfig\.cjs/);
    assert.ok(m, 'body references setup-qa-tsconfig.cjs via a resolved path');
    assert.ok(fs.existsSync(`${m[1]}/scripts/setup-qa-tsconfig.cjs`), 'the resolved base-dir has scripts/setup-qa-tsconfig.cjs');
  });
});

// ─── 9. Missing required flags ─────────────────────────────────────────────────────

test('missing each required flag exits 1 naming it', () => {
  withRepo((root) => {
    const slugsPath = path.join(root, 'slugs.json');
    fs.writeFileSync(slugsPath, JSON.stringify(syntheticSlugs()), 'utf8');
    const required = ['--slugs', '--feature-name', '--prd', '--test-runner', '--browser', '--language'];
    for (const missing of required) {
      const full = { '--slugs': slugsPath, ...BASE_ARGS };
      delete full[missing];
      const args = [SCRIPT, '--repo-root', root, ...toArgs(full)];
      try {
        execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        assert.fail(`expected failure when ${missing} is omitted`);
      } catch (err) {
        assert.equal(err.status, 1, `${missing} omission exits 1`);
        assert.match(err.stderr, new RegExp(missing.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')), `stderr names ${missing}`);
      }
    }
  });
});

// ─── 10. Zero stories ───────────────────────────────────────────────────────────────

test('zero stories => dispatches: [], exit 0', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs({ userStories: [], count: 0 }));
    assert.deepEqual(json.dispatches, []);
    assert.equal(json.storyCount, 0);
  });
});

// ─── 11. Braces quoted by the story are content, not leftover placeholders ──────────

test('a story that quotes an API path like /users/{USER_ID} still renders', () => {
  withRepo((root) => {
    const slugs = syntheticSlugs({
      userStories: [{
        id: 'US-01', text: 'Como admin, eu quero GET /users/{USER_ID} para que eu veja o perfil', role: 'admin',
        want: 'GET /users/{USER_ID}', benefit: 'eu veja o perfil', slug: 'us-01-get-users', requirements: ['FR-001'], uiFacing: false,
      }],
    });
    const { json } = run(root, slugs);
    const body = fs.readFileSync(json.dispatches[0].promptFile, 'utf8');
    assert.ok(body.includes('/users/{USER_ID}'));
    assert.ok(!body.includes('{US_SLUG}'), 'the template tokens are still all filled');
  });
});

// ─── 12. dispatch.prompt is a short, single-line pointer ───────────────────────────

test('dispatch.prompt is a single line under 400 bytes naming the absolute promptFile', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs());
    const { prompt, promptFile } = json.dispatches[0];
    assert.ok(path.isAbsolute(promptFile), 'promptFile is absolute');
    assert.ok(!prompt.includes('\n'), 'prompt is a single line');
    assert.ok(Buffer.byteLength(prompt, 'utf8') < 400, 'prompt is under 400 bytes');
    assert.ok(prompt.includes(promptFile), 'prompt names the absolute promptFile');
  });
});

// ─── 13. Prompt file is dedented and carries no dispatch metadata ──────────────────

test('the prompt file starts with the subagent intro, has column-0 Task headings, and leaks no header/model line', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs());
    const body = fs.readFileSync(json.dispatches[0].promptFile, 'utf8');
    assert.ok(body.startsWith('You are a QA verification subagent'), 'body starts with the subagent intro');
    assert.match(body, /^### Task 1 —/m);
    assert.match(body, /^### Task 4 —/m);
    const lines = body.split('\n');
    assert.ok(!lines.some((l) => l.startsWith('Subagent (')), 'no line starts with "Subagent ("');
    assert.ok(!lines.some((l) => l.startsWith('  model:')), 'no line starts with "  model:"');
  });
});

// ─── 14. --prompt-dir creates a not-yet-existing nested directory ─────────────────

test('--prompt-dir pointing at a not-yet-existing nested directory is created and used', () => {
  withRepo((root) => {
    const nested = path.join(root, 'a', 'b', 'c');
    assert.ok(!fs.existsSync(nested));
    const { json } = run(root, syntheticSlugs(), { '--prompt-dir': nested });
    assert.equal(json.promptDir, path.resolve(nested));
    assert.ok(fs.existsSync(nested));
    assert.ok(fs.existsSync(json.dispatches[0].promptFile));
  });
});

// ─── 15. Omitting --prompt-dir twice yields two distinct temp directories ─────────

test('omitting --prompt-dir twice yields two different unique directories under the OS temp dir', () => {
  withRepo((root) => {
    const { json: json1 } = run(root, syntheticSlugs(), {}, { omitPromptDir: true });
    const { json: json2 } = run(root, syntheticSlugs(), {}, { omitPromptDir: true });
    try {
      assert.notEqual(json1.promptDir, json2.promptDir);
      const tmp = fs.realpathSync(os.tmpdir());
      assert.ok(fs.realpathSync(json1.promptDir).startsWith(tmp), 'promptDir 1 is under the OS temp dir');
      assert.ok(fs.realpathSync(json2.promptDir).startsWith(tmp), 'promptDir 2 is under the OS temp dir');
    } finally {
      fs.rmSync(json1.promptDir, { recursive: true, force: true });
      fs.rmSync(json2.promptDir, { recursive: true, force: true });
    }
  });
});

// ─── 16. description field ──────────────────────────────────────────────────────────

test('dispatch.description equals "QA verify <id>"', () => {
  withRepo((root) => {
    const { json } = run(root, syntheticSlugs());
    assert.equal(json.dispatches[0].description, `QA verify ${json.dispatches[0].usId}`);
  });
});

// ─── 17. No dispatch carries a "block" key ──────────────────────────────────────────

test('no dispatch carries a "block" key', () => {
  withRepo((root) => {
    const slugs = generateSlugs(PRD_FIXTURE);
    const { json } = run(root, slugs);
    for (const dispatch of json.dispatches) {
      assert.ok(!('block' in dispatch), `${dispatch.usId} has no "block" key`);
    }
  });
});
