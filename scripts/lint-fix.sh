#!/bin/bash
# Quick script to fix lint errors locally
# Run this before committing to catch issues early

set -e

# Get script directory and change to parent (app root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_ROOT"

echo "🔍 Running ESLint with auto-fix..."
npm run lint:fix

echo ""
echo "✅ Auto-fixable issues resolved"
echo ""
echo "Remaining issues (if any) need manual fixes:"
npm run lint:check

echo ""
echo "💡 Tips:"
echo "  - Install ESLint extension in VS Code/Cursor for real-time linting"
echo "  - The pre-commit hook will run lint on staged files automatically"
echo "  - Use 'npm run lint:check' to see issues without failing"








