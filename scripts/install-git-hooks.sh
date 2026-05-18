#!/usr/bin/env bash
# Install the immutable-core guard as a commit-msg hook.
# Idempotent; run once per clone (and after this commit lands on the
# loop PC). .git/hooks is not version-controlled, so this script IS
# the versioned source of truth for the hook.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$repo/.git/hooks/commit-msg"
cat > "$hook" <<'EOF'
#!/usr/bin/env bash
# commit-msg: deterministic immutable-core guard (fail-close).
exec node "$(git rev-parse --show-toplevel)/scripts/guard-immutable.mjs" "$1"
EOF
chmod +x "$hook"
echo "installed: $hook -> scripts/guard-immutable.mjs"
