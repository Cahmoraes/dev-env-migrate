#!/usr/bin/env node
/**
 * render-preferences-view.cjs — Render the preferences view of triage option 0.
 *
 * Prints one row per switch (label, state in bold, one line on what the switch controls) as a
 * markdown list, from the same bootstrap JSON derive-session-state.cjs prints, then the
 * change-or-back question as prose. The router's reply IS this output, verbatim, and the
 * turn ends there — no question tool. Two failures this replaces: a hand-written summary
 * ("commit ativo, QA desligado, stack Node...") dropped rows; and a question-tool call
 * carried no rows at all on harnesses whose tool-calling reply has no text (Copilot CLI).
 *
 * Usage:
 *   node render-preferences-view.cjs --platform <claude-code|copilot|codex|gemini|opencode|other>
 *                                    [--repo-root <path>] [--lang <pt-BR|en>]
 *
 * Output: markdown on stdout. Exit codes: 0 success · 1 usage/read error.
 */
'use strict';

const path = require('path');
const { PLATFORMS, buildSessionReport } = require('./derive-session-state.cjs');

const LANGS = ['pt-BR', 'en'];

const HELP = `render-preferences-view.cjs — Render the preferences view (triage option 0).

Usage:
  node render-preferences-view.cjs --platform <${PLATFORMS.join('|')}> [--repo-root <path>] [--lang <${LANGS.join('|')}>]

Prints one row per preference switch as a markdown list, in the requested language (default pt-BR).
`;

const T = {
  'pt-BR': {
    heading: (file) => `**Preferências desta sessão** (\`${file}\`):`,
    on: 'ativo', onF: 'ativa', off: 'desligado', offF: 'desligada', ask: 'perguntar',
    autoCommit: ['Commit automático', 'subagentes commitam a cada task concluída', 'as tasks ficam sem commit até você commitar'],
    qa: ['Gate de QA', 'roda a verificação das user stories ao fim da implementação, sem perguntar, quando há PRD', 'uma pergunta ao chegar no gate, quando há PRD', 'a verificação das user stories nunca roda'],
    finish: ['Ao finalizar', { ask: 'perguntar — o menu de finalização decide (alternativas: merge local · push + PR · manter branch)', merge: 'merge local — a branch é mergeada sem perguntar', pr: 'push + PR — a branch é publicada e um pull request aberto sem perguntar', keep: 'manter branch — nada é mergeado nem publicado' }],
    companion: ['Visual Companion', 'o brainstorming pode oferecer o preview local em decisões visuais', 'o brainstorming nunca oferece o preview local'],
    codeReview: ['Code-review final', (eff) => `(efeito: ${eff}) — passada nativa extra ao fim da implementação`],
    copilotReview: ['Copilot review final', 'passada nativa extra ao fim da implementação'],
    tiers: ['Modelos por tier', 'cheap · standard · capable'],
    corporate: ['Artefatos corporativos', (n, f) => `${n} em \`${f}\` entram no brainstorming e no PRD`, (n, f) => `${n} declarado(s) em \`${f}\`, **não carregados** (peça para ativar)`, (f) => `ativo, mas \`${f}\` não existe`, 'documentos da empresa não entram no brainstorming nem no PRD'],
    profile: ['Perfil do projeto', 'stack que as skills assumem', 'não decidido — o brainstorming pergunta a stack primeiro', 'não configurado'],
    question: 'Responda **1** para alterar essas preferências ou **0** para voltar ao menu.',
  },
  en: {
    heading: (file) => `**Preferences for this session** (\`${file}\`):`,
    on: 'on', onF: 'on', off: 'off', offF: 'off', ask: 'ask',
    autoCommit: ['Auto-commit', 'subagents commit after each completed task', 'tasks stay uncommitted until you commit'],
    qa: ['QA gate', 'runs the user-story verification at the end of implementation, without asking, when a PRD exists', 'one question at the gate, when a PRD exists', 'the user-story verification never runs'],
    finish: ['On finish', { ask: 'ask — the finishing menu decides (alternatives: local merge · push + PR · keep branch)', merge: 'local merge — the branch is merged without asking', pr: 'push + PR — the branch is pushed and a pull request opened without asking', keep: 'keep branch — nothing is merged or pushed' }],
    companion: ['Visual Companion', 'brainstorming may offer the local preview on visual decisions', 'brainstorming never offers the local preview'],
    codeReview: ['Final code-review', (eff) => `(effort: ${eff}) — extra native pass at the end of implementation`],
    copilotReview: ['Final Copilot review', 'extra native pass at the end of implementation'],
    tiers: ['Model tiers', 'cheap · standard · capable'],
    corporate: ['Corporate artifacts', (n, f) => `${n} in \`${f}\` feed brainstorming and the PRD`, (n, f) => `${n} declared in \`${f}\`, **not loaded** (ask to enable)`, (f) => `on, but \`${f}\` does not exist`, 'company documents do not feed brainstorming or the PRD'],
    profile: ['Project profile', 'stack the skills assume', 'not decided — brainstorming asks the stack first', 'not configured'],
    question: 'Reply **1** to change these preferences or **0** to go back to the menu.',
  },
};

function tier(value) {
  return value == null || value === '' ? 'auto' : String(value);
}

function relativeConfigPath(report) {
  const abs = report.corporateArtifacts && report.corporateArtifacts.configPath;
  if (!abs) return '.superpowers/corporate-artifacts.yml';
  const prefsPath = report.preferencesPath;
  if (prefsPath) {
    const root = path.dirname(path.dirname(prefsPath));
    return path.relative(root, abs) || '.superpowers/corporate-artifacts.yml';
  }
  return '.superpowers/corporate-artifacts.yml';
}

// "state — gloss" text → [state, gloss]; gloss is '' when the separator is absent.
function splitAt(text, sep = ' — ') {
  const i = text.indexOf(sep);
  return i === -1 ? [text, ''] : [text.slice(0, i), text.slice(i + sep.length)];
}

function renderRows(report, lang = 'pt-BR') {
  const t = T[lang];
  const s = report.sessionState;
  const row = (label, state, gloss) => `- **${label}**: **${state}**${gloss ? ` — ${gloss}` : ''}`;
  const splitRow = (label, text, sep) => row(label, ...splitAt(text, sep));
  const rows = [];

  rows.push(row(t.autoCommit[0], s.session_auto_commit ? t.on : t.off, s.session_auto_commit ? t.autoCommit[1] : t.autoCommit[2]));
  if (!s.session_qa_gate_enabled) rows.push(row(t.qa[0], t.off, t.qa[3]));
  else if (s.session_qa_gate_ask) rows.push(row(t.qa[0], t.ask, t.qa[2]));
  else rows.push(row(t.qa[0], t.on, t.qa[1]));
  const finish = t.finish[1][s.session_finish_action] || t.finish[1].ask;
  rows.push(splitRow(t.finish[0], finish));
  rows.push(row(t.companion[0], s.session_visual_companion_enabled ? t.on : t.off, s.session_visual_companion_enabled ? t.companion[1] : t.companion[2]));
  if (report.platform === 'claude-code') {
    const [effort, gloss] = splitAt(t.codeReview[1](s.session_code_review_effort || 'medium'));
    rows.push(row(t.codeReview[0], `${s.session_code_review_final_enabled ? t.on : t.off} ${effort}`, gloss));
  } else if (report.platform === 'copilot') {
    rows.push(row(t.copilotReview[0], s.session_copilot_review_final_enabled ? t.on : t.off, t.copilotReview[1]));
  }
  rows.push(row(t.tiers[0], `${tier(s.session_model_tier_cheap)} / ${tier(s.session_model_tier_standard)} / ${tier(s.session_model_tier_capable)}`, t.tiers[1]));
  const c = report.corporateArtifacts || {};
  const file = relativeConfigPath(report);
  if (c.declared && c.enabled) rows.push(row(t.corporate[0], t.on, t.corporate[1](c.count, file)));
  else if (c.declared && !c.enabled) rows.push(row(t.corporate[0], t.off, t.corporate[2](c.count, file)));
  else if (!c.declared && c.enabled) rows.push(splitRow(t.corporate[0], t.corporate[3](file), ', '));
  else rows.push(row(t.corporate[0], t.off, t.corporate[4]));
  const p = report.projectProfile || {};
  if (!p.declared) rows.push(row(t.profile[0], t.profile[3], ''));
  else if (!p.stack && !p.manifest) rows.push(splitRow(t.profile[0], t.profile[2]));
  else rows.push(row(t.profile[0], `${p.stack || 'auto'}${p.manifest ? ` (\`${p.manifest}\`)` : ''}`, t.profile[1]));

  return rows;
}

function renderView(report, lang = 'pt-BR') {
  const t = T[lang];
  const file = '.superpowers/preferences.yml';
  const lines = [t.heading(file), ...renderRows(report, lang)];
  for (const dropped of report.unavailableModelTiers || []) {
    const name = dropped && dropped.tier ? dropped.tier : String(dropped);
    const model = dropped && dropped.configured ? dropped.configured : '';
    lines.push(lang === 'en'
      ? `  - \`${name}: ${model}\` does not exist on this platform (${report.platform}) — that tier fell back to \`auto\``
      : `  - \`${name}: ${model}\` não existe nesta plataforma (${report.platform}) — esse tier caiu para \`auto\``);
  }
  lines.push('', t.question);
  return lines.join('\n') + '\n';
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  let platform = 'claude-code';
  let repoRoot = null;
  let lang = 'pt-BR';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) platform = args[++i];
    else if (args[i] === '--repo-root' && args[i + 1]) repoRoot = path.resolve(args[++i]);
    else if (args[i] === '--lang' && args[i + 1]) lang = args[++i];
  }
  if (!PLATFORMS.includes(platform)) {
    process.stderr.write(`--platform must be one of ${PLATFORMS.join('/')} (got "${platform}")\n`);
    process.exit(1);
  }
  if (!LANGS.includes(lang)) {
    process.stderr.write(`--lang must be one of ${LANGS.join('/')} (got "${lang}")\n`);
    process.exit(1);
  }
  let report;
  try {
    report = buildSessionReport({ platform, repoRoot });
  } catch (err) {
    process.stderr.write(`Failed to read preferences: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(renderView(report, lang));
  process.exit(0);
}

module.exports = { renderRows, renderView, LANGS };

if (require.main === module) {
  main(process.argv);
}
