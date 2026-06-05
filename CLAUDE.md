# CLAUDE.md

Ferramenta exportar ambiente (zsh + Claude Code) e reconstruir em outra máquina, **bidirecional** WSL/macOS/Linux. Export determinístico (scripts); import híbrido (Claude lê roteiro e adapta).

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
- `import-env` — DESTINO: dry-run → backup → executa `SETUP.md` e `CLAUDE_SETUP.md` adaptando ao SO → verifica → gera `RELATORIO_IMPORT.md` (falhas/intervenções; molde em `references/`). Viaja com repo (após `git clone`).

## Arquitetura

Duas pontas, conectadas por `profile/` (via git):

```
ORIGEM (export.sh)              profile/            DESTINO (Claude lê o roteiro)
classifica cada item     →   manifest + dotfiles  →  detecta o SO daqui e adapta
```

- **Dados vs código:** conhecimento mora em JSON (`catalog.json`, `claude_catalog.json`); lógica em Python (`exporter.py`, `claude_exporter.py`). **Adicionar ferramenta/language server = editar JSON, não código.**
- **Bidirecionalidade = classificar origem + filtrar destino.** Export rotula cada linha não-portável por plataforma (`macos`/`wsl_windows`/`debian_binary_rename`); destino remove as que não são do SO local. Uma engine só (O(N), não O(N²)).

## Arquivos-chave

| Arquivo | Papel |
|---|---|
| `lib/catalog.json` | Conhecimento ferramentas shell + `platform_specific_patterns` (por SO). |
| `lib/exporter.py` | Motor export shell. `scan_platform_lines` rotula por plataforma; `render_setup_md` gera roteiro. |
| `lib/claude_catalog.json` | Language servers por plugin LSP + `sensitive_never_export` + `non_portable_markers`. |
| `lib/claude_exporter.py` | Motor export Claude. **Sanitiza segredos** antes de copiar. |
| `scripts/dryrun.py` | `compute_adaptation_plan()` — regra pura manter×remover por destino. |

## Gotchas (não-óbvios — leia antes de mexer)

- **Segredos nunca viajam.** `claude_exporter.py` remove chaves que casam `api_key|token|secret|password` e nunca copia `.credentials.json`, `.claude.json`, `history.jsonl`, `projects/`, `sessions/`. Alterar exporter → preserve sanitização e `${HOME}` (paths absolutos do home viram `${HOME}`). Testes dedicados em `test_claude_exporter.py`.
- **Ordem de varredura importa:** em `scan_platform_lines`, `wsl_windows` vem ANTES de `macos`. Path Windows montado (`/mnt/c/Users/...`) contém `/Users/` (marcador macOS) — marcador WSL mais específico deve vencer. Inverter ordem reintroduz falso positivo (tem teste de regressão).
- **`profile/` gerado mas versionado.** Não edite à mão; rode exports. Antes de `git add`, limpe caches: `rm -rf tests/__pycache__ lib/__pycache__ scripts/__pycache__`.
- **Estado volátil não viaja:** `copy_dotfiles` ignora `buffers`/`backups` do micro (crash-recovery). Só config viaja.
- **`python3` é dependência dos exports e dry-run.** Em testes com PATH mínimo, use binário real (`sys.executable`), não `command -v python3` — shim pyenv é script bash e quebra sem `bash` no PATH.
- **`bat`/`fd` são bidirecionais:** Debian/Ubuntu usa `batcat`/`fdfind` (precisam alias); macOS nativos (sem alias). Roteiro adiciona no Debian e remove no macOS — não trate como caso único.

## Convenções

- Idioma: **português pt-br** (comentários, docs, roteiros, commits). Identificadores de código em inglês.
- Testes: `unittest` puro, sem dependências. Manter assim — ferramenta que prepara máquinas limpas deve rodar em máquina limpa.
- Funções I/O isolam efeitos atrás de globais (`HOME`, `OUT`) e `which()`, para testabilidade com mocks/tmpdirs.