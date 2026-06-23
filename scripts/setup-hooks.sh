#!/bin/bash
# setup-hooks.sh
# Run this once after cloning: bash scripts/setup-hooks.sh

HOOK_DIR="$(git rev-parse --show-toplevel)/.git/hooks"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing git hooks..."

# Copy pre-commit hook
cp "$SCRIPT_DIR/pre-commit" "$HOOK_DIR/pre-commit"
chmod +x "$HOOK_DIR/pre-commit"

echo "✅ Git hooks installed."
echo "   pre-commit: checks that CHANGELOG.md is staged before committing."
