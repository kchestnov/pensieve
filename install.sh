#!/bin/sh
set -e

REPO="https://raw.githubusercontent.com/kchestnov/pensieve/main"
BIN="$HOME/.local/bin"
ZSH_FUNCTIONS="$HOME/.local/share/zsh/site-functions"
CLAUDE_COMMANDS="$HOME/.claude/commands"

install_file() {
    local src="$1" dest="$2" mode="${3:-}"
    if [ -f "$dest" ]; then
        action="Updating"
    else
        action="Installing"
    fi
    curl -fsSL "$REPO/$src" -o "$dest"
    [ -n "$mode" ] && chmod "$mode" "$dest"
    echo "  $action $dest"
}

echo "Installing pensieve..."
echo ""

mkdir -p "$BIN"
install_file pensieve "$BIN/pensieve" 755

mkdir -p "$ZSH_FUNCTIONS"
install_file _pensieve "$ZSH_FUNCTIONS/_pensieve"

if [ -d "$CLAUDE_COMMANDS" ]; then
    install_file .claude/commands/pensieve.md "$CLAUDE_COMMANDS/pensieve.md"
else
    echo "  Skipping Claude skill (~/.claude/commands not found)"
fi

echo ""
echo "Done. Make sure these are in your .zshrc:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "  fpath=(\$HOME/.local/share/zsh/site-functions \$fpath)"
echo "  autoload -Uz compinit && compinit"
