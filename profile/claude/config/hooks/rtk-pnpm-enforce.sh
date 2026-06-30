#!/usr/bin/env bash
# Bloqueia 'pnpm --filter' sem prefixo rtk e exige a forma correta.
# Integrado como PreToolUse hook no Claude Code (settings.json).

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)

# Detecta 'pnpm --filter ...' sem prefixo rtk (e sem já ter rtk na frente)
if echo "$CMD" | grep -qE '^[[:space:]]*pnpm[[:space:]]+--filter' \
   && ! echo "$CMD" | grep -qE '^[[:space:]]*rtk[[:space:]]'; then
    echo "RTK ENFORCE: comando bloqueado." >&2
    echo "  Encontrado: pnpm --filter ..." >&2
    echo "  Correto:    rtk pnpm --filter ..." >&2
    echo "RTK.md: pnpm --filter requer prefixo manual (não é capturado pelo hook automaticamente)." >&2
    exit 2
fi

exit 0
