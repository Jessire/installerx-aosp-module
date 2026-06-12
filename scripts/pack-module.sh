#!/usr/bin/env bash
# Assemble an InstallerX AOSP priv-app Magisk/KernelSU module that mirrors the
# official wxxsfxyzm module layout (id=com.android.packageinstaller).
#
# Usage:
#   pack-module.sh <apk_path> <version> <version_code> <variant> <out_zip>
#
#   apk_path     : built AOSP-variant APK (applicationId=com.android.packageinstaller)
#   version      : module.prop version string, e.g. 26.06.2430cda
#   version_code : module.prop versionCode (integer)
#   variant      : online | offline (description text only)
#   out_zip      : output module zip path
set -euo pipefail

APK_PATH="$1"
VERSION="$2"
VERSION_CODE="$3"
VARIANT="$4"
OUT_ZIP="$5"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$ROOT_DIR/module-template"

[ -f "$APK_PATH" ] || { echo "ERROR: APK not found: $APK_PATH" >&2; exit 1; }

# Verify the packaged APK really is the AOSP variant. A wrong applicationId
# would silently produce a module that cannot replace the system installer.
if command -v aapt2 >/dev/null 2>&1; then
  PKG="$(aapt2 dump packagename "$APK_PATH" 2>/dev/null || true)"
  if [ -n "$PKG" ] && [ "$PKG" != "com.android.packageinstaller" ]; then
    echo "ERROR: APK packageName is '$PKG', expected 'com.android.packageinstaller'." >&2
    echo "       Build with -PAPP_ID=com.android.packageinstaller." >&2
    exit 1
  fi
  echo "Verified packageName: ${PKG:-<unknown>}"
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

cp -a "$TEMPLATE_DIR/." "$BUILD_DIR/"

# Drop the APK into the priv-app slot, mirroring the official tree.
APK_DEST_DIR="$BUILD_DIR/system/priv-app/PackageInstaller"
mkdir -p "$APK_DEST_DIR"
cp "$APK_PATH" "$APK_DEST_DIR/PackageInstaller.apk"

# Fill module.prop placeholders.
PROP="$BUILD_DIR/module.prop"
sed -i \
  -e "s|__VERSION__|${VERSION}|g" \
  -e "s|__VERSIONCODE__|${VERSION_CODE}|g" \
  -e "s|__VARIANT__|${VARIANT}|g" \
  "$PROP"

echo "----- module.prop -----"
cat "$PROP"
echo "-----------------------"

mkdir -p "$(dirname "$OUT_ZIP")"
rm -f "$OUT_ZIP"

# Zip from inside the tree so paths are module-root relative (no leading ./).
( cd "$BUILD_DIR" && zip -r -X "$OUT_ZIP" . -x ".*" >/dev/null )

echo "Module written: $OUT_ZIP"
unzip -l "$OUT_ZIP"