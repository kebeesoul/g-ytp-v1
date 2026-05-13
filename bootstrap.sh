#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ Linking dotfiles..."

# Git 설정
ln -sf "$DOTFILES_DIR/.gitconfig" ~/.gitconfig
ln -sf "$DOTFILES_DIR/.gitignore_global" ~/.gitignore_global
git config --global core.excludesfile ~/.gitignore_global

# Claude Code 전역 설정
mkdir -p ~/.claude
ln -sf "$DOTFILES_DIR/claude/CLAUDE.md" ~/.claude/CLAUDE.md
ln -sf "$DOTFILES_DIR/settings.json" ~/.claude/settings.json

# 프로젝트별 기본 마크다운 파일 설정
mkdir -p ~/.git-template
cp "$DOTFILES_DIR/templates/CLAUDE.md" ~/.git-template/CLAUDE.md
cp "$DOTFILES_DIR/templates/DESIGN.md" ~/.git-template/DESIGN.md
cp "$DOTFILES_DIR/templates/AGENTS.md" ~/.git-template/AGENTS.md
git config --global init.templateDir ~/.git-template

echo "✓ Dotfiles linked"
