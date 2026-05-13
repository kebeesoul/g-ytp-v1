#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$DOTFILES_DIR/setup.sh"      # 1. 도구 설치
bash "$DOTFILES_DIR/bootstrap.sh"  # 2. 파일 배포

echo "✅ dotfiles setup complete"
