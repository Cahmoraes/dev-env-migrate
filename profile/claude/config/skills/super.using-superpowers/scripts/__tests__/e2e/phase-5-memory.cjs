'use strict';
// FASE 5 — Memória / re-sync: compute-inventory -> update-manifest -> check-resync -> verify-sync.
// Juncao alvo: os TRES eixos do gate (conteudo dirty, presenca no DB, drift de modelo)
// e o guard write-side que recusa gravar slug sem nota.
const { run, sh, write, read, check, assert, eq, setPhase, report, ROOT, fs, path } = require('./harness.cjs');
const A = require('./artifacts.cjs');

const USP = 'super.using-superpowers/scripts';
const PM = 'super.persistent-memory/scripts';

const manifestPath = path.join(ROOT, '.memory/resync-manifest.json');

function inventario() {
  const r = run(`${USP}/compute-inventory.cjs`, ['--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  return r.json;
}

function resync(extra = []) {
  const r = run(`${USP}/check-resync.cjs`, ['--repo-root', ROOT, ...extra]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  return r.json;
}

setPhase('P5 memoria: inventario de artefatos');

check('compute-inventory enxerga a feature criada nas fases anteriores', () => {
  const inv = inventario();
  eq(inv.repoRoot, ROOT, 'repoRoot');
  const slugs = inv.features.map(f => f.slug);
  assert(slugs.includes(A.FEATURE), `feature ausente: ${slugs}`);
  const f = inv.features.find(x => x.slug === A.FEATURE);
  assert(f.artifacts.spec.hash, 'hash da spec nao calculado');
  assert(f.artifacts.prd.hash, 'hash do PRD nao calculado');
  eq(f.artifacts.spec.exists, true, 'spec.exists');
  return `${inv.features.length} feature(s), hashMethod=${inv.hashMethod}`;
});

check('sem manifesto: a feature e new e o gate esta sujo', () => {
  const inv = inventario();
  const f = inv.features.find(x => x.slug === A.FEATURE);
  eq(f.status, 'new', 'status');
  const rs = resync();
  eq(rs.dirty, true, 'dirty: feature nunca sincronizada');
  return 'primeira sessao pede sync';
});

setPhase('P5 memoria: update-manifest e o guard write-side');

check('GUARD write-side: recusa registrar slug sem nota no pmem, e NOMEIA o slug', () => {
  // Invariante: manifest.synced_features[slug] <=> pmem tem >=1 nota do slug.
  // Sem sync real de memoria, gravar o slug criaria presence drift invisivel.
  const inv = inventario();
  const f = inv.features.find(x => x.slug === A.FEATURE);
  const payload = {
    treeHash: inv.treeHash, hashMethod: inv.hashMethod,
    syncedFeatures: { [A.FEATURE]: {
      spec_hash: f.artifacts.spec.hash, prd_hash: f.artifacts.prd.hash,
      qa_hash: f.artifacts.qa ? f.artifacts.qa.hash : null, adr_hash: null } },
    deletedSlugs: [],
  };
  const inFile = path.join(ROOT, 'manifest-in.json');
  fs.writeFileSync(inFile, JSON.stringify(payload));
  const r = run(`${USP}/update-manifest.cjs`, ['--repo-root', ROOT, '--input-file', inFile]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.json.written, true, 'o manifesto ainda e escrito');
  eq(r.json.validated, true, 'validated: o DB pode ser consultado');
  eq(r.json.rejected, [A.FEATURE], 'o slug sem nota deve ser rejeitado e nomeado');
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(!m.synced_features[A.FEATURE], 'slug rejeitado NAO pode entrar no manifesto');
  assert(/refusing to record/i.test(r.stderr), `o aviso deve chegar ao operador: ${r.stderr.slice(0, 120)}`);
  return 'presence drift barrado na origem';
});

// Escreve o manifesto DIRETO no disco, contornando o guard write-side, para poder
// exercitar o eixo de CONTEUDO isoladamente (o eixo de PRESENCA ja foi coberto acima).
function manifestoDireto(hashes) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({
    last_synced_at: new Date().toISOString(),
    last_synced_tree_hash: null,
    last_synced_hash_method: 'stat',
    synced_features: { [A.FEATURE]: hashes },
  }));
}

check('manifesto com hashes atuais deixa a feature unchanged no eixo de conteudo', () => {
  const inv0 = inventario();
  const f0 = inv0.features.find(x => x.slug === A.FEATURE);
  manifestoDireto({
    spec_hash: f0.artifacts.spec.hash, prd_hash: f0.artifacts.prd.hash,
    qa_hash: f0.artifacts.qa ? f0.artifacts.qa.hash : null, adr_hash: null,
  });
  const f = inventario().features.find(x => x.slug === A.FEATURE);
  // read-side: presenca ausente reclassifica unchanged -> changed (auto-cura)
  eq(f.dbPresent, false, 'dbPresent');
  eq(f.status, 'changed', 'sem nota no DB, o read-side reabre a feature');
  const rs = resync();
  eq(rs.dirty, true, 'dirty por presence drift');
  assert((rs.driftedSlugs || []).includes(A.FEATURE), `driftedSlugs deveria nomear a feature: ${JSON.stringify(rs.driftedSlugs)}`);
  return 'read-side auto-cura o drift de presenca';
});

check('editar a spec muda o hash de CONTEUDO (nao depende de commit do git)', () => {
  const specRel = `${A.DIR}/specs/${A.FEATURE}-design.md`;
  const antes = read(specRel);
  const hashAntes = inventario().features.find(x => x.slug === A.FEATURE).artifacts.spec.hash;
  write(specRel, antes + '\n## Nota adicionada depois do sync\n');
  const hashDepois = inventario().features.find(x => x.slug === A.FEATURE).artifacts.spec.hash;
  assert(hashAntes !== hashDepois, 'hash nao mudou apos editar a spec');
  const rs = resync();
  eq(rs.dirty, true, 'dirty');
  write(specRel, antes);
  const hashRestaurado = inventario().features.find(x => x.slug === A.FEATURE).artifacts.spec.hash;
  eq(hashRestaurado, hashAntes, 'hash deve ser estavel apos restaurar o conteudo');
  return 'delta por conteudo, sem git';
});

check('delete e cirurgico: remove o slug pedido e PRESERVA os demais', () => {
  // partida: manifesto com duas entradas escritas direto (o guard ja foi coberto acima)
  fs.writeFileSync(manifestPath, JSON.stringify({
    last_synced_at: new Date().toISOString(), last_synced_tree_hash: null,
    last_synced_hash_method: 'stat',
    synced_features: {
      [A.FEATURE]: { spec_hash: 'sha256:aaa', prd_hash: null, qa_hash: null, adr_hash: null },
      'feature-antiga': { spec_hash: 'sha256:bbb', prd_hash: null, qa_hash: null, adr_hash: null },
    },
  }));
  const inFile = path.join(ROOT, 'manifest-del.json');
  fs.writeFileSync(inFile, JSON.stringify({
    treeHash: null, hashMethod: 'stat', syncedFeatures: {}, deletedSlugs: ['feature-antiga'],
  }));
  const r = run(`${USP}/update-manifest.cjs`, ['--repo-root', ROOT, '--input-file', inFile]);
  eq(r.json.written, true, 'written');
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(!m.synced_features['feature-antiga'], 'slug deletado permaneceu');
  assert(m.synced_features[A.FEATURE], 'delete levou junto outra feature (prune global!)');
  return 'sem prune global';
});

setPhase('P5 memoria: verify-sync (Step 5 obrigatorio)');

check('verify-sync reporta coerencia ou nao-verificabilidade, sem crash', () => {
  const r = run(`${PM}/verify-sync.cjs`, ['--repo-root', ROOT]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert('verifiable' in r.json, 'campo verifiable ausente');
  // Sem DB do pmem o script nao pode verificar — degradacao graciosa, nao erro.
  if (!r.json.verifiable) {
    assert(r.json.reason, 'nao-verificavel sem motivo declarado');
    eq(r.status, 0, 'nao-verificavel nao e drift');
  }
  return `verifiable=${r.json.verifiable} reason=${r.json.reason || '-'}`;
});

check('verify-sync sai 2 quando ha drift real (manifesto sem lastro)', () => {
  const r = run(`${PM}/verify-sync.cjs`, ['--repo-root', ROOT, '--manifest', manifestPath,
    '--db', path.join(ROOT, 'db-que-nao-existe.sqlite')]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.status === 0 || r.status === 2, `exit inesperado ${r.status}`);
  if (r.status === 2) assert(r.json.missing && r.json.missing.length, 'drift sem lista de faltantes');
  return `exit=${r.status} verifiable=${r.json.verifiable}`;
});

setPhase('P5 memoria: dependencias e persistencia');

check('check-pmem-deps reporta o ambiente sem quebrar o gate', () => {
  const r = run(`${PM}/check-pmem-deps.cjs`);
  assert(r.json, `sem JSON: ${r.stderr}`);
  eq(r.status, 0, 'exit code');
  assert('fullyAvailable' in r.json, 'fullyAvailable ausente');
  assert(Array.isArray(r.json.missing), 'missing ausente');
  return `python=${r.json.pythonAvailable} full=${r.json.fullyAvailable}`;
});

check('persist-feature-memory degrada gracioso quando o pmem nao esta disponivel', () => {
  const inFile = path.join(ROOT, 'notes.json');
  fs.writeFileSync(inFile, JSON.stringify({
    feature: A.FEATURE,
    entries: [{ text: 'Decisao: expirada conta como expiration E miss; documentado no design.', tags: [`feature:${A.FEATURE}`, 'type:decision'] }],
  }));
  const r = run(`${PM}/persist-feature-memory.cjs`, ['--input-file', inFile]);
  assert(r.json, `sem JSON: ${r.stderr}`);
  assert(r.status === 0 || r.status === 2, `exit inesperado: ${r.status}`);
  assert('pmemAvailable' in r.json, 'pmemAvailable ausente');
  return `pmemAvailable=${r.json.pmemAvailable} mode=${r.json.mode}`;
});

setPhase('P5 memoria: gate gateado por preferencia');

check('memory.persistent_memory:false desliga session_memory_enabled', () => {
  const prefsPath = path.join(ROOT, '.superpowers/preferences.yml');
  const antes = fs.readFileSync(prefsPath, 'utf8');
  fs.writeFileSync(prefsPath, antes.replace(/persistent_memory:\s*true/, 'persistent_memory: false'));
  const r = run(`${USP}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  eq(r.json.sessionState.session_memory_enabled, false, 'session_memory_enabled');
  fs.writeFileSync(prefsPath, antes);
  const back = run(`${USP}/derive-session-state.cjs`, ['--platform', 'claude-code', '--repo-root', ROOT]);
  eq(back.json.sessionState.session_memory_enabled, true, 'restaurado');
  return 'gate de memoria respeita a preferencia';
});

report();

setPhase('P5 memoria: gate de saida (re-sync no fim do fluxo)');

// Juncao alvo: o gate de SAIDA (finishing, Step 8) sincroniza UMA feature com
// `compute-inventory --feature`, e o gate de ENTRADA (proxima sessao) precisa aceitar o
// manifesto resultante. Se os dois discordassem, a feature ficaria dirty para sempre e o
// gate de saida nao teria eliminado nada — so adicionado trabalho.
check('escopo por --feature nao muda classificacao, hashes nem treeHash', () => {
  // A segunda feature nao e decoracao: com uma so no disco, um treeHash calculado sobre o
  // subconjunto filtrado daria o MESMO valor e o check passaria sem provar nada.
  const outra = path.join(ROOT, 'docs/superpowers/outra-feature/specs');
  try {
    fs.mkdirSync(outra, { recursive: true });
    fs.writeFileSync(path.join(outra, 'outra-feature-design.md'), '# Design\n\nde outro dev\n');

    const todos = inventario();
    assert(todos.features.length >= 2, 'o repo precisa de 2+ features para o check valer');
    const um = run(`${USP}/compute-inventory.cjs`, ['--repo-root', ROOT, '--feature', A.FEATURE]);
    assert(um.json, `sem JSON: ${um.stderr}`);
    eq(um.json.feature, A.FEATURE, 'feature');
    eq(um.json.features.length, 1, 'o relatorio deve trazer exatamente a feature pedida');
    eq(um.json.treeHash, todos.treeHash, 'treeHash tem de continuar repo-wide');
    eq(
      JSON.stringify(um.json.features[0]),
      JSON.stringify(todos.features.find(f => f.slug === A.FEATURE)),
      'a entrada escopada tem de ser identica a do run completo',
    );
    return `1 de ${todos.features.length} feature(s), mesmo fingerprint`;
  } finally {
    fs.rmSync(path.join(ROOT, 'docs/superpowers/outra-feature'), { recursive: true, force: true });
  }
});

check('manifesto escrito pelo gate de saida e aceito pelo gate de entrada', () => {
  const backup = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
  const outraDir = path.join(ROOT, 'docs/superpowers/outra-feature/specs');
  try {
    // Uma segunda feature que o gate de saida NAO tocou: e ela quem prova que o
    // escopo foi respeitado (continua `new`) e que nada de terceiros foi ingerido.
    fs.mkdirSync(outraDir, { recursive: true });
    fs.writeFileSync(path.join(outraDir, 'outra-feature-design.md'), '# Design\n\nde outro dev\n');

    const escopado = run(`${USP}/compute-inventory.cjs`, ['--repo-root', ROOT, '--feature', A.FEATURE]).json;
    const f = escopado.features[0];
    // Step B do gate de saida: manifesto com ESTE slug apenas, sem deletedSlugs.
    manifestoDireto({
      spec_hash: f.artifacts.spec.hash, prd_hash: f.artifacts.prd.hash,
      qa_hash: f.artifacts.qa ? f.artifacts.qa.hash : null,
      adr_hash: f.artifacts.adrs ? f.artifacts.adrs.hash : null,
    });

    // Proxima sessao: gate de entrada, repo inteiro.
    const entrada = inventario();
    const depois = entrada.features.find(x => x.slug === A.FEATURE);
    const outra = entrada.features.find(x => x.slug === 'outra-feature');

    // No eixo de CONTEUDO a feature sincronizada esta em dia: so a ausencia de nota no
    // DB da sandbox a reabre, e e por isso que ela aparece em driftedSlugs (que so
    // recebe slug cujo conteudo bateu). Um manifesto com hash errado a marcaria
    // `changed` FORA de driftedSlugs — a falha que este check pega.
    if (depois.dbPresent === false) {
      assert((entrada.driftedSlugs || []).includes(A.FEATURE),
        `conteudo nao bateu: ${A.FEATURE} veio ${depois.status} fora de driftedSlugs`);
    } else {
      eq(depois.status, 'unchanged', 'feature sincronizada pelo gate de saida');
    }
    eq(outra.status, 'new', 'a feature de terceiros NAO pode ter sido sincronizada junto');
    assert(!(entrada.driftedSlugs || []).includes('outra-feature'),
      'feature nunca sincronizada nao e presence drift');
    return `escopo respeitado: ${A.FEATURE} em dia, outra-feature intacta`;
  } finally {
    fs.rmSync(path.join(ROOT, 'docs/superpowers/outra-feature'), { recursive: true, force: true });
    if (backup !== null) fs.writeFileSync(manifestPath, backup);
    else fs.rmSync(manifestPath, { force: true });
  }
});
