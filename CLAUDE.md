O arquivo não existe no disco — o conteúdo foi fornecido diretamente no prompt. Vou aplicar todas as correções e retornar o arquivo corrigido.

# CLAUDE.md

Ferramenta exportar ambiente (zsh + Claude Code), reconstruir outra máquina. **Bidirecional** WSL/macOS/Linux. Export determinístico; import híbrido (Claude lê roteiro, adapta).

## Comandos

```bash
# Testes (só stdlib — NÃO há pytest nem deps externas). Inclui integração (2 fluxos).
python3 -m unittest discover -s tests -p "test_*.py"

# Exports (rodam na ORIGEM; geram/atualizam profile/)
./export.sh            # ambiente shell  → profile/ (manifest.json, SETUP.md, dotfiles/)
./export-claude.sh     # config do Claude → profile/claude/ (claude-manifest.json, CLAUDE_SETUP.md, config/)

# Preview no DESTINO (read-only, não instala nada)
./scripts/dry-run.sh

# Rede de segurança no DESTINO
./scripts/backup.sh                       # snapshot antes de alterar
./scripts/restore.sh ~/.shell-config-backups/<ts>   # revert
```

Mudar `lib/*.py` ou `lib/*.json` → **regenere profile** (`./export.sh && ./export-claude.sh`). `profile/` gerado mas commitado (viaja para outra máquina).

**Fluxo via Claude (sem scripts à mão)** — skills em `.claude/skills/`:
- `export-env` — ORIGEM: gera profiles, checa segredos, commita, push.
- `import-env` — DESTINO: dry-run → backup → executa `SETUP.md`/`CLAUDE_SETUP.md` adaptando SO → verifica → gera `RELATORIO_IMPORT.md` (molde em `references/`). Viaja com repo (após `git clone`).

## Arquitetura

Duas pontas, `profile/` via git:

```
ORIGEM (export.sh)              profile/            DESTINO (Claude lê o roteiro)
classifica cada item     →   manifest + dotfiles  →  detecta o SO daqui e adapta
```

- **Dados vs código:** JSON guarda conhecimento (`catalog.json`, `claude_catalog.json`); Python tem lógica (`exporter.py`, `claude_exporter.py`). **Adicionar ferramenta/language server = editar JSON.**
- **Bidirecionalidade = classificar origem + filtrar destino.** Export rotula linha não-portável por plataforma (`macos`/`wsl_windows`/`debian_binary_rename`); destino remove as do outro SO. Uma engine (O(N)).
- **Três categorias no import.** Instalar falta + pular existe + **remover sumiu da origem** (deleção propagada). Detecção por **recibo**: destino grava `~/.dev-env-migrate/` a cada import; `recibo − manifest_atual = órfão`. Recibo (não disco) distingue "removido na origem" de "instalado pelo usuário". Política JSON (`removal_policy`): `prompt_remove` (tool-owned) × `report_only` (binário). Engine em `lib/reconcile.py`.

## Arquivos-chave

| Arquivo | Papel |
|---|---|
| `lib/catalog.json` | Ferramentas shell + `platform_specific_patterns` por SO. |
| `lib/exporter.py` | Motor export shell. `scan_platform_lines` rotula por plataforma; `render_setup_md` gera roteiro. |
| `lib/claude_catalog.json` | Language servers por plugin LSP + `sensitive_never_export` + `non_portable_markers`. |
| `lib/claude_exporter.py` | Motor export Claude. **Sanitiza segredos**. `inventory_config_dirs` lista skills/agents/commands/hooks (`config_inventory` no manifest). |
| `lib/reconcile.py` | Engine pura de **remoção**. `compute_removal_plan(prev, curr, dims)` — órfão = id no recibo e ausente no manifest. Dimensões/ação vêm de `removal_policy`. |
| `scripts/receipt.py` | Recibo último import (`~/.dev-env-migrate/`). `save`/`load`/`show`. Baseline da próxima reconciliação. |
| `scripts/dryrun.py` | `compute_adaptation_plan()` — regra manter×remover por destino. `render_removal_section()` mostra órfãos. |

## Gotchas (não-óbvios — leia antes de mexer)

- **Segredos nunca viajam.** `claude_exporter.py` remove chaves que casam `api_key|token|secret|password`, nunca copia `.credentials.json`, `.claude.json`, `history.jsonl`, `projects/`, `sessions/`. Alterar exporter → preserve sanitização e `${HOME}` (paths absolutos do home viram `${HOME}`). Testes em `test_claude_exporter.py`.
- **Ordem de varredura importa:** em `scan_platform_lines`, `wsl_windows` vem ANTES de `macos`. Path Windows (`/mnt/c/Users/...`) contém `/Users/` — marcador WSL mais específico vence. Inverter reintroduz falso positivo (tem teste de regressão).
- **`profile/` gerado mas versionado.** Não edite à mão; rode exports. Antes de `git add`, limpe caches: `rm -rf tests/__pycache__ lib/__pycache__ scripts/__pycache__`.
- **Estado volátil não viaja:** `copy_dotfiles` ignora `buffers`/`backups` do micro. Só config viaja.
- **`python3` é dependência dos exports e dry-run.** Em testes com PATH mínimo, use `sys.executable`, não `command -v python3` — shim pyenv quebra sem `bash` no PATH.
- **`bat`/`fd` são bidirecionais:** Debian/Ubuntu usa `batcat`/`fdfind` (precisam alias); macOS nativo. Roteiro adiciona alias no Debian, remove no macOS.
- **Remoção: recibo é fonte de verdade, não disco.** Reconciliação: `recibo (último import) − manifest atual`. Não espelhe disco do destino — apagaria o que usuário instalou. O recibo (`scripts/receipt.py`, em `~/.dev-env-migrate/`, fora do repo) só contém o que o tool aplicou. **Primeiro import = sem recibo = nada remover** (correto). Skill `import-env` grava recibo **só no fim, sem erro bloqueante**. **`prompt_remove` nunca desinstala binário de sistema** — desinstalar `git`/`node` quebraria máquina; `report_only` para CLI/language server. Adicionar categoria reconciliável = nova entrada em `removal_policy.dimensions`, não código em `reconcile.py`.
- **`config_inventory` precisa de re-export.** Remoção de skill/agent/command só detectável porque `claude-manifest.json` lista por nome. Mudou skills → **re-exporte** (`./export-claude.sh`).

## Convenções

- Idioma: **português pt-br** (comentários, docs, roteiros, commits). Identificadores em inglês.
- Testes: `unittest` puro, sem deps. Manter — ferramenta que prepara máquinas limpas deve rodar em máquina limpa.
- Funções I/O isolam efeitos atrás de globais (`HOME`, `OUT`) e `which()` para testabilidade.
- **Toda mudança neste `CLAUDE.md` passa por `/caveman:caveman-compress CLAUDE.md`** antes de commitar (backup legível em `CLAUDE.original.md`). Edite em linguagem natural, depois rode compress.