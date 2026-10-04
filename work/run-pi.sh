#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/learning-env.sh"
if [[ -n "${TMUX_PANE:-}" ]]; then
  tmux set-option -t "$TMUX_PANE" extended-keys on
  tmux set-option -t "$TMUX_PANE" set-titles on
  tmux set-option -t "$TMUX_PANE" set-titles-string '#{pane_title}'
fi
# Resume this workspace's latest session; credentials stay in its ignored work/pi-agent folder.
exec pi --approve --continue --no-skills --skill "$workspace/.pi/skills"
