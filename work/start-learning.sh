#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/learning-env.sh"
if [[ "${1:-}" == "--check" ]]; then
  pi --version
  tmux -V
  rsvg-convert --version
  exit 0
fi
if [[ -n "${TMUX:-}" ]]; then exec bash "$workspace/work/run-pi.sh"; fi
session="learning-$(printf '%s' "$workspace" | sha256sum | cut -c1-12)"
printf -v launch 'bash %q' "$workspace/work/run-pi.sh"
exec tmux new-session -A -s "$session" -c "$workspace" "$launch"
