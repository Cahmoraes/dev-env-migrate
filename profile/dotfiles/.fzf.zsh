# Setup fzf
# ---------
if [[ ! "$PATH" == *$HOME/.fzf/bin* ]]; then
  PATH="$HOME/.fzf/bin${PATH:+:${PATH}}"
fi

source <(~/.fzf/bin/fzf --zsh)
