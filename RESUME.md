# headroom-ai — Auditoria e Configuração (2026-06-13)

## Objetivo

Verificar atualizações recentes do headroom-ai e garantir que todas as recomendações
estão aplicadas para maximizar a economia de tokens no ambiente Claude Code.

---

## Estado antes da auditoria

| Item | Status |
|---|---|
| Versão instalada | `0.25.0` |
| Versão mais recente (PyPI) | `0.25.0` |
| Proxy (`ANTHROPIC_BASE_URL`) | ativo em `http://127.0.0.1:8787` |
| MCP SDK | instalado |
| MCP registrado no Claude Code | via marketplace plugin (`headroom@headroom-marketplace`) |
| Extras opcionais `[ml,memory,relevance,code,mcp]` | já instalados (ocultos no `pip show`) |
| `headroom learn` rodado anteriormente | nunca |
| Memória cross-session | zerada (`No memories found`) |

**Performance (últimos 7 dias antes da auditoria):**
- 602 requisições
- 25.961.192 → 21.993.840 tokens (redução de **15,3%**)
- 3.967.352 tokens economizados
- `claude-sonnet-4-6`: 19% de redução | `claude-opus-4-8`: 12% de redução
- `content_router`: apenas 0,3% de redução média (sinal de que padrões semânticos não estavam calibrados)

---

## Ações executadas

### 1. Verificação de versão

```bash
pip index versions headroom-ai
# Resultado: INSTALLED: 0.25.0 | LATEST: 0.25.0
```

Nenhuma atualização necessária.

### 2. Extras opcionais — confirmação de instalação

```bash
pip install "headroom-ai[ml,memory,relevance,code,mcp]"
# Resultado: todos os requirements já satisfeitos
```

Os extras estavam instalados mas não apareciam no `pip show headroom-ai`
(campo `Requires:` exibe apenas dependências base, não extras opcionais).

Extras confirmados como ativos: `ml`, `memory`, `relevance`, `code`, `mcp`,
incluindo `sentence-transformers`, `scikit-learn`, `torch` para compressão semântica.

### 3. MCP CCR — instalação nativa

```bash
headroom mcp install
# Resultado: claude: already registered
#            codex: registered
```

O MCP já estava registrado via marketplace plugin. O comando nativo registrou
também no canal direto do Codex. O fluxo CCR (Compress-Cache-Retrieve) com as
ferramentas `mcp__headroom__headroom_compress`, `mcp__headroom__headroom_retrieve`
e `mcp__headroom__headroom_stats` está ativo.

### 4. `headroom learn --apply`

Análise de 92 sessões Claude Code + 2 sessões Codex.
- **313 falhas** identificadas
- **18 recomendações** geradas e aplicadas

#### Arquivos modificados

**`/home/cahmoraes/projects/estudo/clean-arch-solid-ddd/CLAUDE.md`**
Seção `<!-- headroom:learn:start/end -->` adicionada com 9 padrões:

| Padrão | Economia estimada |
|---|---|
| `pmem` CLI — sintaxe correta de `add-batch` vs `add` | ~800 tokens/sessão |
| Frontend test commands — `pnpm --filter frontend test -- --run` | ~600 tokens/sessão |
| git — sempre rodar da raiz do monorepo | ~500 tokens/sessão |
| Skill namespace — forma `super.*`, não `superpowers:*` | ~400 tokens/sessão |
| Writing-plans scripts — `.cjs` não `.js` | ~400 tokens/sessão |
| Stripe API version drift — onde atualizar após upgrade | ~400 tokens/sessão |
| Biome lint — comandos por workspace com `--filter` | ~350 tokens/sessão |
| Zsh: `status` é variável reservada | ~300 tokens/sessão |
| context-mode MCP tools — ToolSearch antes de chamar | ~300 tokens/sessão |

**`/home/cahmoraes/.claude/projects/-home-cahmoraes-projects-estudo-clean-arch-solid-ddd/memory/MEMORY.md`**
Seção `<!-- headroom:learn:start/end -->` adicionada com 6 padrões de memória
persistente derivados de falhas passadas:

- Skills path canônico: `.claude/skills/` (não `.github/skills/` global)
- pnpm @types/react hoist — fix para libs class-component (react-easy-crop, react-imask)
- Gym Seed & Prisma client gotchas — rodar `prisma:generate` após migrations
- Headroom proxy — como reiniciar se cair
- Autorização de commits — auto_commit via preferences.yml prevalece
- Nomenclatura de interfaces — sem prefixo `I`

**`/home/cahmoraes/projects/estudo/clean-arch-solid-ddd/AGENTS.md`**
Arquivo criado com padrões específicos para sessões Codex:

- Skills path canônico (`.claude/skills/`, nunca `~/.github/skills/`)

**`/home/cahmoraes/.codex/instructions.md`**
Instruções globais do Codex atualizadas com os mesmos padrões de skills path.

---

## Estado após a auditoria

| Item | Status |
|---|---|
| Versão | `0.25.0` (mais recente) |
| Proxy | ativo em `http://127.0.0.1:8787` |
| MCP CCR | registrado via marketplace + canal nativo |
| Extras ML/memory/relevance | confirmados ativos |
| `headroom learn` | aplicado — 18 recomendações em 4 arquivos |
| Economia projetada pelos padrões aprendidos | ~4.050 tokens/sessão adicionais |

---

## Manutenção futura

- `headroom learn --apply --project .` — rodar periodicamente (semanal/quinzenal)
  para incorporar novos padrões de falha à medida que o projeto evolui.
- `headroom perf` — monitorar se a redução sobe acima de 15% com os extras ML ativos.
- Os delimitadores `<!-- headroom:learn:start/end -->` protegem o conteúdo manual
  dos arquivos de contexto — reescrita nas próximas execuções é segura.
