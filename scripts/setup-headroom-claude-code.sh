#!/usr/bin/env bash
#
# setup-headroom-claude-code.sh
#
# Instala e configura o Headroom (headroom-ai) em MODO PROXY
# (ANTHROPIC_BASE_URL) para uso com Claude Code autenticado via assinatura
# Pro/Max (login OAuth). Portável entre Linux e macOS: o headroom escolhe o
# supervisor de processo da plataforma automaticamente (systemd no Linux,
# launchd no macOS) via 'headroom install apply'.
#
# ATENÇÃO — risco de ToS aceito deliberadamente:
# A comunidade do headroom reporta (github.com/headroomlabs-ai/headroom,
# discussions #867 "Not safe for Oauth use with CC?", #969 "Is headroom safe
# to use with Claude Code subscription?", #1272 "OAuth/Claude Pro requests
# timeout with 502") que rotear tokens OAuth de assinatura Pro/Max/Free por
# um proxy de terceiros viola o Consumer ToS atual da Anthropic (risco real
# de suspensão de conta) e tem bugs reportados de timeout 502 nesse modo.
# Esse risco foi avaliado e aceito conscientemente para obter os benefícios
# completos do headroom (compressão automática, modo cache de prefix-cache,
# memória persistente, compressão AST-aware). Uma versão anterior deste
# script evitava esse caminho (modo MCP-only); veja o histórico do git se
# quiser voltar a ele.
#
# Limitações conhecidas do modo proxy (verificadas em v0.32.0, ver
# github.com/headroomlabs-ai/headroom):
# - `/remote-control` (`/rc`) fica bloqueado enquanto ANTHROPIC_BASE_URL
#   apontar pra um host customizado — é um gate client-side do próprio
#   Claude Code (não do headroom), e NENHUMA configuração do headroom
#   (proxy direto ou `headroom wrap claude`) devolve isso (PR #1883,
#   "UX/notice-only; no request bytes touched"). Se precisar de /rc numa
#   sessão, rode `claude` sem o ANTHROPIC_BASE_URL nessa sessão específica.
# - Carregamento de tools sob demanda (issue #746) está OK neste setup: o
#   `headroom init claude` grava `ENABLE_TOOL_SEARCH=true` no settings.json,
#   que é o caminho de correção documentado na PR #753 para quem roteia
#   direto via settings.json (sem `headroom wrap`).
# - Janela de 1M de contexto (issue #1158) só é obtida via
#   `headroom wrap claude --1m` (seta ANTHROPIC_MODEL='...[1m]' no processo
#   lançado). Não há equivalente via settings.json — fora do escopo deste
#   script. Só relevante se você usa Opus com contexto estendido.
#
# Servidor MCP do headroom (headroom_compress/retrieve/stats) NÃO é
# registrado por este script: com o proxy ativo a compressão já é
# automática e transparente; o MCP seria só uma via manual redundante.
# Se quiser reativá-lo mesmo assim: 'headroom mcp install --agent claude'.
#
# Referência: https://github.com/headroomlabs-ai/headroom
#             https://headroom-docs.vercel.app/docs/proxy

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf '[headroom-setup] %s\n' "$*"; }
warn() { printf '[headroom-setup][aviso] %s\n' "$*" >&2; }
die()  { printf '[headroom-setup][erro] %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Pré-requisitos
# ---------------------------------------------------------------------------
command -v python3 >/dev/null 2>&1 || die "python3 não encontrado no PATH."

PY_VERSION="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
PY_MAJOR="$(python3 -c 'import sys; print(sys.version_info[0])')"
PY_MINOR="$(python3 -c 'import sys; print(sys.version_info[1])')"
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]; }; then
    die "headroom-ai exige Python 3.10+; encontrado $PY_VERSION."
fi
log "Python $PY_VERSION ok (>= 3.10)."

command -v claude >/dev/null 2>&1 \
    || die "Claude Code CLI ('claude') não encontrado no PATH. Instale-o antes de continuar."
log "Claude Code CLI encontrado: $(command -v claude)."

# ---------------------------------------------------------------------------
# 2. Instalação via pip
# ---------------------------------------------------------------------------
log "Instalando headroom-ai[all] via pip (usuário atual, sem sudo)..."
python3 -m pip install --user --upgrade "headroom-ai[all]"

# pip acabou de escrever um binário novo no user-base do Python (~/.local/bin
# no Linux e em builds não-framework do macOS; ~/Library/Python/X.Y/bin em
# builds framework do python.org no macOS); o bash cacheia lookups de PATH
# na sessão atual (hash table), então força reindexação antes de chamar
# 'headroom' pela primeira vez nesta sessão.
hash -r

if ! command -v headroom >/dev/null 2>&1; then
    USER_BIN="$(python3 -m site --user-base)/bin"
    if [ -x "$USER_BIN/headroom" ]; then
        warn "'headroom' não estava no PATH desta sessão; adicionando $USER_BIN."
        export PATH="$USER_BIN:$PATH"
        hash -r
    fi
fi
command -v headroom >/dev/null 2>&1 \
    || die "instalação concluída mas o binário 'headroom' não foi encontrado. Adicione '$(python3 -m site --user-base)/bin' ao PATH (no seu .bashrc/.zshrc) e rode o script de novo."

log "headroom instalado: $(headroom --version)"

# ---------------------------------------------------------------------------
# 3. Compressão AST-aware exige tree-sitter (extra opcional [code])
# ---------------------------------------------------------------------------
if ! python3 -c "import tree_sitter" >/dev/null 2>&1; then
    warn "tree-sitter não encontrado; --code-aware ficará sem efeito até instalar."
    warn "Rode: python3 -m pip install --user --upgrade 'headroom-ai[code]'"
else
    log "tree-sitter disponível — compressão AST-aware (--code-aware) habilitável."
fi

# ---------------------------------------------------------------------------
# 4. Deployment persistente do proxy (supervisor de processo da plataforma)
#
# 'headroom install apply' cria e habilita um serviço de usuário no
# supervisor nativo da plataforma (systemd no Linux, launchd no macOS) que
# mantém 'headroom proxy' rodando em background, sobrevivendo a reboot.
# --providers manual --target claude escopa a instalação só ao Claude Code
# (não mexe em Codex/Copilot/Cursor mesmo que detectados).
# --mode cache é o modo recomendado pelo próprio headroom para agentes de
# código: prioriza estabilidade do prefix-cache do provider em vez de
# compressão bruta (que reescreveria turnos anteriores e estouraria cache).
# --memory liga memória persistente (por projeto, sem vazamento entre
# workspaces). --code-aware liga compressão AST-aware via tree-sitter.
# Idempotente: pode rodar de novo para atualizar a config de um deployment
# existente sem duplicar.
# ---------------------------------------------------------------------------
log "Instalando/atualizando deployment persistente do proxy (escopo: user, alvo: claude)..."
headroom install apply \
    --scope user \
    --providers manual \
    --target claude \
    --mode cache \
    --memory \
    --code-aware

# ---------------------------------------------------------------------------
# 5. Roteamento do Claude Code (ANTHROPIC_BASE_URL + ENABLE_TOOL_SEARCH)
#
# 'headroom init claude' grava em ~/.claude/settings.json (escopo user):
#   - ANTHROPIC_BASE_URL=http://127.0.0.1:<port>
#   - ENABLE_TOOL_SEARCH=true (correção da issue #746 para quem roteia
#     direto via settings.json, sem 'headroom wrap')
# Exige reiniciar qualquer sessão do Claude Code já aberta para ter efeito.
# ---------------------------------------------------------------------------
log "Registrando roteamento persistente do Claude Code pro proxy do headroom..."
headroom init --global --port 8787 --memory claude

# ---------------------------------------------------------------------------
# 6. Validação da configuração persistida
# ---------------------------------------------------------------------------
log "Rodando 'headroom doctor' (diagnóstico)..."
headroom doctor || warn "'headroom doctor' reportou avisos acima — revise antes de seguir."

log "Verificando o deployment persistente do proxy..."
DEPLOY_STATUS="$(headroom install status --profile default)"
echo "$DEPLOY_STATUS"
echo "$DEPLOY_STATUS" | grep -q "Healthy:    yes" \
    || die "'headroom install apply' rodou mas 'headroom install status' não confirma o deployment saudável. Revise a saída acima e tente 'headroom install restart --profile default'."

# ---------------------------------------------------------------------------
# 7. Resumo
# ---------------------------------------------------------------------------
cat <<'EOF'

============================================================
 Headroom configurado em MODO PROXY (ANTHROPIC_BASE_URL)
============================================================
- Proxy rodando como serviço persistente de usuário (systemd no Linux,
  launchd no macOS), sobrevive a reboot, porta 8787.
- ~/.claude/settings.json foi atualizado com ANTHROPIC_BASE_URL e
  ENABLE_TOOL_SEARCH=true. REINICIE qualquer sessão do Claude Code já
  aberta para o roteamento entrar em vigor.
- Modo cache + memória persistente por projeto + compressão AST-aware
  (--code-aware) ativos. Compressão acontece automaticamente no proxy,
  sem precisar de nenhuma ferramenta MCP manual.

Limitações aceitas (ver cabeçalho do script para detalhes/referências):
- `/remote-control` (`/rc`) fica bloqueado enquanto o proxy estiver
  roteando — gate do próprio Claude Code, sem correção do lado do headroom.
- Janela de 1M de contexto não é obtida por este setup (exigiria
  `headroom wrap claude --1m`, fora do escopo aqui).
- Risco de ToS: rotear OAuth Pro/Max por proxy de terceiro (mesmo local)
  pode violar o Consumer ToS da Anthropic — risco aceito conscientemente.

Comandos úteis daqui pra frente:
  headroom doctor                              # revalida config + roteamento
  headroom install status                      # status do deployment persistente
  headroom install restart --profile default   # reinicia o proxy persistente
  tail -f ~/.headroom/logs/proxy.log            # logs do proxy (cross-platform)
  headroom savings                             # economia acumulada (ledger local)
  headroom install remove --profile default    # reverte o deployment persistente
============================================================
EOF
