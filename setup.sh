#!/bin/bash
set -e

echo "→ Checking Node.js..."

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found. Install Node.js 18.18 or later first."
  exit 1
fi

NODE_VERSION=$(node -p "process.versions.node")
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)

if [ "$NODE_MAJOR" -lt 18 ] || { [ "$NODE_MAJOR" -eq 18 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  echo "❌ Node.js $NODE_VERSION found. Node.js 18.18 or later is required."
  exit 1
fi

echo "✓ Node.js $NODE_VERSION"

echo "→ Installing Claude Code and Codex CLI..."

npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex

echo ""
echo "✓ Tools installed"
echo ""
echo "Next steps inside Claude Code:"
echo "  /plugin marketplace add openai/codex-plugin-cc"
echo "  /plugin install codex@openai-codex"
echo "  /reload-plugins"
echo "  /codex:setup"
echo ""
echo "If Codex is not logged in:"
echo "  !codex login"
echo ""
echo "Optional review gate:"
echo "  /codex:setup --enable-review-gate"
echo ""
echo "⚠️ Review gate can create long Claude/Codex loops and may drain usage limits quickly."
