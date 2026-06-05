#!/usr/bin/env bash
# Installs the Claude deploy public key into the current user's authorized_keys.
# Pulled via git so the key text (which contains +, /, @) never has to be typed
# through the Hetzner VNC console, whose keymap mangles shifted symbols.
# Idempotent: safe to run repeatedly.
set -euo pipefail

KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICDkI9G95+nyb73211fO0LsOe7uwsv54nFxYfyEt/4V+ claude-deploy@hbstats'

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"

if grep -qF "$KEY" "$HOME/.ssh/authorized_keys"; then
  echo "deploy key already present for $(whoami) in $HOME/.ssh/authorized_keys"
else
  printf '%s\n' "$KEY" >> "$HOME/.ssh/authorized_keys"
  echo "deploy key INSTALLED for $(whoami) in $HOME/.ssh/authorized_keys"
fi
