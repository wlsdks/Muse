#!/usr/bin/env bash
# Create a STABLE local self-signed code-signing identity named "Muse Local
# Signing" in your login keychain. Run this ONCE. Thereafter make-app.sh signs
# Muse.app with it instead of an ad-hoc signature, so macOS permission grants
# (mic / speech / Documents / Desktop / Downloads — TCC) PERSIST across rebuilds
# instead of re-prompting every time.
#
# WHY this is needed: an ad-hoc signature ("codesign --sign -") has no stable
# Designated Requirement. TCC attributes a grant to the signature, so with ad-hoc
# each rebuild looks like a "new" app and macOS asks again. A self-signed
# identity has a constant Designated Requirement, so the grant sticks.
#
# INTERACTIVE: importing the identity and marking it trusted for code signing
# touches your login keychain and may prompt for your macOS login password (and
# a keychain-access confirmation). That is expected and local-only — nothing
# leaves your Mac. This script is NOT run by the build; you run it by hand once.
#
# Usage:
#   bash apps/desktop/scripts/make-signing-cert.sh
#   bash apps/desktop/scripts/make-app.sh          # now signs with the identity
set -euo pipefail

CN="Muse Local Signing"
KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning 2>/dev/null | grep -qF "$CN"; then
  echo "A code-signing identity named '$CN' already exists — nothing to do."
  echo "Rebuild with: bash apps/desktop/scripts/make-app.sh"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# A minimal OpenSSL config: self-signed cert with the Code Signing extended key
# usage (codesign requires EKU=codeSigning + a matching private key).
cat > "$WORK/openssl.cnf" <<CNF
[ req ]
distinguished_name = dn
x509_extensions = v3
prompt = no
[ dn ]
CN = ${CN}
[ v3 ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF

echo "generating a self-signed code-signing certificate…"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" -config "$WORK/openssl.cnf"

# Bundle key+cert into a PKCS#12 for import (empty export password).
openssl pkcs12 -export -inkey "$WORK/key.pem" -in "$WORK/cert.pem" \
  -name "$CN" -out "$WORK/muse-local-signing.p12" -passout pass:

echo "importing into the login keychain (allowing codesign to use it)…"
# -T /usr/bin/codesign lets codesign use the key without a per-build prompt.
security import "$WORK/muse-local-signing.p12" -k "$KEYCHAIN" -P "" \
  -T /usr/bin/codesign -T /usr/bin/security

echo "marking the certificate trusted for code signing (may prompt for your password)…"
# Trust the cert for code signing so codesign accepts it as a valid identity.
sudo security add-trusted-cert -d -r trustAsRoot \
  -p codeSign -k /Library/Keychains/System.keychain "$WORK/cert.pem" || {
    echo "  (system-wide trust step skipped/declined — trying user trust store)"
    security add-trusted-cert -r trustAsRoot -p codeSign -k "$KEYCHAIN" "$WORK/cert.pem" || true
  }

if security find-identity -v -p codesigning 2>/dev/null | grep -qF "$CN"; then
  echo "✓ created code-signing identity '$CN'."
  echo "  Now rebuild: bash apps/desktop/scripts/make-app.sh"
else
  echo "WARNING: '$CN' is not showing up as a codesigning identity yet." >&2
  echo "  You may need to open Keychain Access and set the certificate's trust" >&2
  echo "  for 'Code Signing' to 'Always Trust'. make-app.sh still works ad-hoc." >&2
  exit 1
fi
