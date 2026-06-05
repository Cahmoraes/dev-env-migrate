# Setup fzf
# ---------
if [[ ! "$PATH" == */home/cahmoraes/.fzf/bin* ]]; then
  PATH="/home/cahmoraes/.fzf/bin${PATH:+:${PATH}}"
fi

source <(~/.fzf/bin/fzf --zsh)
