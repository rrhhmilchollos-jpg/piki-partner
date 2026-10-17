#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${PIKI_SIGNING_STORE_FILE:?Define PIKI_SIGNING_STORE_FILE con la ruta absoluta del signing.keystore}"
: "${PIKI_SIGNING_STORE_PASSWORD:?Define PIKI_SIGNING_STORE_PASSWORD sin escribirla en el repositorio}"
: "${PIKI_SIGNING_KEY_ALIAS:?Define PIKI_SIGNING_KEY_ALIAS}"
: "${PIKI_SIGNING_KEY_PASSWORD:?Define PIKI_SIGNING_KEY_PASSWORD sin escribirla en el repositorio}"
: "${ANDROID_HOME:?Define ANDROID_HOME apuntando al Android SDK}"

if [[ ! -f "$PIKI_SIGNING_STORE_FILE" ]]; then
  echo "No existe el keystore: $PIKI_SIGNING_STORE_FILE" >&2
  exit 1
fi

cd "$ROOT"
pnpm install --frozen-lockfile
pnpm build
pnpm exec cap sync android

cd android
./gradlew bundleRelease --no-daemon

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
if [[ ! -f "$AAB" ]]; then
  echo "Gradle terminó sin generar el AAB esperado: $AAB" >&2
  exit 1
fi

echo "AAB firmado generado: $AAB"
sha256sum "$AAB"
