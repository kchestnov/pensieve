#!/bin/sh
set -e

REPO="https://raw.githubusercontent.com/kchestnov/pensieve/main"
BIN="$HOME/.local/bin"
ZSH_FUNCTIONS="$HOME/.local/share/zsh/site-functions"
CLAUDE_COMMANDS="$HOME/.claude/commands"
CLAUDE_SKILLS="$HOME/.claude/skills"
PENSIEVE_HOME="${PENSIEVE_HOME:-$HOME/pensieve}"

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

mkdir -p "$CLAUDE_COMMANDS"
install_file .claude/commands/pensieve.md "$CLAUDE_COMMANDS/pensieve.md"

mkdir -p "$CLAUDE_SKILLS/legilimens"
install_file .claude/skills/legilimens/SKILL.md "$CLAUDE_SKILLS/legilimens/SKILL.md"

mkdir -p "$PENSIEVE_HOME/raw/assets"
mkdir -p "$PENSIEVE_HOME/wiki/sources"
mkdir -p "$PENSIEVE_HOME/wiki/entities"
mkdir -p "$PENSIEVE_HOME/wiki/concepts"
mkdir -p "$PENSIEVE_HOME/wiki/actions"
mkdir -p "$PENSIEVE_HOME/memory"

echo ""
echo "Done. Make sure these are in your .zshrc:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "  fpath=(\$HOME/.local/share/zsh/site-functions \$fpath)"
echo "  autoload -Uz compinit && compinit"
