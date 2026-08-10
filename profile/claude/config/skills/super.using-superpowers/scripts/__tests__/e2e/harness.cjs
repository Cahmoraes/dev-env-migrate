'use strict';
/*
 * harness.cjs — runner das fases e2e (juncoes entre skills).
 *
 * Diferenca para o resto da suite: os testes unitarios exercitam UM script contra
 * fixtures sinteticas. Aqui o artefato produzido por uma etapa alimenta literalmente
 * a etapa seguinte, sobre um repo consumidor sandbox. O alvo sao as JUNCOES —
 * template -> validador, parse-waves -> manifesto -> validate-dispatch,
 * render-screen -> check-visual-state — que nenhum teste isolado cobre.
 *
 * `check()` REGISTRA um teste do node:test em vez de executar na hora. Isso e o que
 * permite as fases serem quase byte-identicas ao harness original, mas impoe uma
 * regra: efeito colateral de fase mora DENTRO de um `check('setup: ...')`, nunca no
 * top-level do modulo. Top-level roda no require (antes do corpo de qualquer teste)
 * e reordenaria o pipeline em silencio.
 */
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// .../skills/super.using-superpowers/scripts/__tests__/e2e -> .../skills
const SKILLS = path.resolve(__dirname, '..', '..', '..', '..');

// Sandbox efemero fora do repo: as fases fazem `git init`, criam branches e escrevem
// artefatos. Nada disso pode encostar na arvore de trabalho real.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'superpowers-e2e-'));

let phase = '';

function setPhase(p) { phase = p; }

function check(name, fn) {
  test(phase ? `${phase} :: ${name}` : name, fn);
}

// `report()` existia no harness standalone para imprimir o placar. Sob node:test o
// placar e do proprio runner; fica como no-op para as fases nao precisarem mudar.
function report() {}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

// Roda um script de skill. Retorna {stdout, stderr, status, json}.
// Nunca lanca por exit code: o veredito dos scripts do superpowers mora no JSON.
function run(scriptRelPath, args = [], opts = {}) {
  const script = path.join(SKILLS, scriptRelPath);
  let stdout = '', stderr = '', status = 0;
  const errFile = path.join(os.tmpdir(), `e2e-stderr-${process.pid}.txt`);
  try {
    // stderr precisa ser capturado TAMBEM no caminho de sucesso: guards do superpowers
    // avisam por stderr enquanto emitem JSON valido em stdout e saem 0.
    const fd = fs.openSync(errFile, 'w');
    try {
      stdout = execFileSync('node', [script, ...args], {
        encoding: 'utf8',
        cwd: opts.cwd || ROOT,
        env: { ...process.env, ...(opts.env || {}) },
        stdio: ['pipe', 'pipe', fd],
        input: opts.input,
      });
    } finally {
      fs.closeSync(fd);
      try { stderr = fs.readFileSync(errFile, 'utf8'); } catch (_) {}
    }
  } catch (e) {
    status = e.status === undefined || e.status === null ? -1 : e.status;
    stdout = e.stdout ? e.stdout.toString() : '';
    stderr = e.stderr ? e.stderr.toString() : '';
    if (!stderr) { try { stderr = fs.readFileSync(errFile, 'utf8'); } catch (_) {} }
  }
  try { fs.unlinkSync(errFile); } catch (_) {}
  let json = null;
  try { json = JSON.parse(stdout); } catch (_) { /* saida textual */ }
  return { stdout, stderr, status, json };
}

// Git hermetico: sem config global do usuario, sem hooks herdados, branch inicial fixa.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'e2e',
  GIT_AUTHOR_EMAIL: 'e2e@test',
  GIT_COMMITTER_NAME: 'e2e',
  GIT_COMMITTER_EMAIL: 'e2e@test',
};

// `bash -c`, nao `-lc`: o harness nao pode depender do profile do usuario.
function sh(cmd, cwd = ROOT) {
  return execFileSync('bash', ['-c', cmd], { encoding: 'utf8', cwd, env: GIT_ENV });
}


function write(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function cleanup() {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}

module.exports = {
  SKILLS, ROOT, GIT_ENV,
  run, sh, write, read, exists, cleanup,
  check, assert, eq, setPhase, report,
  fs, path,
};
