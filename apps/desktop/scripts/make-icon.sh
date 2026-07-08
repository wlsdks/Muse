#!/usr/bin/env bash
# Build AppIcon.icns (the Muse bluebird) from the canonical @muse/mascot pixel
# data, with macOS's native tools (sips + iconutil). The 1024 master is rendered
# by gen-app-icon.mjs (single source of truth — same bird as the CLI/README/web);
# there is NO hand-drawn source PNG. Run once; the .icns is committed and copied
# into the app bundle by make-app.sh.
#
#   MUSE_ICON_VARIANT=flat|gradient|glow  scripts/make-icon.sh   (default: gradient)
set -euo pipefail
cd "$(dirname "$0")/.."   # → apps/desktop

VARIANT="${MUSE_ICON_VARIANT:-gradient}"

# The generator imports @muse/mascot's built dist — make sure it exists.
if [ ! -f ../../packages/mascot/dist/pixel-data.js ]; then
  echo "building @muse/mascot (needed for the icon source)…"
  ( cd ../.. && pnpm --filter @muse/mascot build >/dev/null )
fi

WORK="$(mktemp -d)"
MASTER="$WORK/icon-1024.png"
ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"

echo "rendering 1024 master (variant: $VARIANT)…"
node scripts/gen-app-icon.mjs --variant "$VARIANT" --out "$MASTER" --size 1024

for s in 16 32 128 256 512; do
  sips -z "$s" "$s"        "$MASTER" --out "$ICONSET/icon_${s}x${s}.png"    >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d"        "$MASTER" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o AppIcon.icns
rm -rf "$WORK"
echo "built apps/desktop/AppIcon.icns (variant: $VARIANT)"
