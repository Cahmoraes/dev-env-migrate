
export PYENV_ROOT="$HOME/.pyenv"
command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"

# nvm/pnpm: garante PATH também em shells não-interativos (ex: VS Code Server
# no WSL, que carrega .zshenv mas não .zshrc). Sem isso, subprocessos como o
# Biome LSP caem no node do sistema (/usr/bin/node, versão antiga sem
# optional chaining) em vez do node instalado via nvm.
export NVM_DIR="$HOME/.nvm"
if [ -z "$NVM_ZSHENV_DONE" ]; then
  nvm_default="$(cat "$NVM_DIR/alias/default" 2>/dev/null)"
  if [ -n "$nvm_default" ] && [ -d "$NVM_DIR/versions/node/$nvm_default/bin" ]; then
    export PATH="$NVM_DIR/versions/node/$nvm_default/bin:$PATH"
  fi
  export NVM_ZSHENV_DONE=1
fi

export PNPM_HOME="$HOME/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
