# Headroom + MCP Tool Search — alinhamento entre máquinas

> Por que o WSL consumia ~16k tokens a mais no início de cada sessão que o macOS,
> e como corrigir mantendo o proxy headroom.

## Causa raiz

O Claude Code tem o **MCP Tool Search**: por padrão difere (carrega sob demanda) os
schemas dos MCP tools, mantendo o baseline da sessão enxuto.

Esse recurso é **desligado automaticamente** quando `ANTHROPIC_BASE_URL` aponta para um
host não-first-party — o caso do **proxy headroom** (`http://127.0.0.1:8787`). A doc oficial:

> "Tool search ... is also disabled when `ANTHROPIC_BASE_URL` points to a non-first-party
> host, since most proxies do not forward `tool_reference` blocks.
> **Set `ENABLE_TOOL_SEARCH` explicitly to override either fallback.**"
> — https://code.claude.com/docs/en/mcp

Resultado sem a flag: todos os MCP tools (headroom, serena, context-mode, ide, Exa)
carregam *eager* → +~16k tokens no baseline por sessão.

## Correção

Adicionar ao `env` do `settings.json` (ao lado do `ANTHROPIC_BASE_URL`):

```json
"env": {
  "ANTHROPIC_BASE_URL": "http://127.0.0.1:8787",
  "ENABLE_TOOL_SEARCH": "true"
}
```

Valores possíveis de `ENABLE_TOOL_SEARCH`:

| Valor | Comportamento |
|---|---|
| (não setado) | difere on-demand; **fallback para upfront** com proxy/Vertex |
| `true` | difere **tudo**; envia o beta header mesmo via proxy |
| `auto` | carrega upfront se couber em 10% do contexto; difere o resto |
| `auto:N` | threshold custom (N = 0–100) |
| `false` | tudo upfront, sem deferral |

**Pré-requisitos:** modelo Sonnet 4+/Opus 4+ (Haiku não suporta) e o proxy precisa
repassar os `tool_reference` blocks. O **headroom 0.23.0 repassa** (byte-faithful
passthrough + merge session-sticky do `anthropic-beta`) — validado: `claude -p` via
proxy retorna EXIT 0 e os MCP tools migram para *deferred*.

## Resultado medido (WSL)

| Categoria | Antes | Depois |
|---|---|---|
| Total baseline | 48.9k (24%) | ~28k (14%) |
| System tools | 24.2k | 11.4k |
| MCP tools | 8.6k | 0 (on-demand) |

Economia de ~21k tokens por sessão.

## Checklist para alinhar o macOS (origem)

1. Garantir `ENABLE_TOOL_SEARCH=true` no ambiente do Claude no macOS:
   - se usa proxy via `env` no `settings.json` → adicionar a chave (como no WSL);
   - se usa `headroom wrap claude` → exportar a variável antes, ou setar no settings.
2. Rodar `./export-claude.sh` no macOS → captura a config no `profile/`.
3. `git add profile/ && git commit && git push`.
4. No WSL: `git pull` + skill `import-env`.

## Notas

- `serena` e `headroom` (mcp) ficam em `~/.claude.json` (arquivo de segredos) — **não
  viajam no profile**. Portabilidade vem de `headroom init claude` / `headroom install`
  no destino.
- O proxy headroom comprime apenas ~1.5% do tráfego (`headroom perf`); o ganho real do
  setup é o tool search. Com `ENABLE_TOOL_SEARCH=true` os dois coexistem sem conflito.
- Desabilitar só a ferramenta de busca (sem mexer no resto):
  `"permissions": { "deny": ["ToolSearch"] }`.
