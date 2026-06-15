#!/system/bin/sh

rm -rf /data/system/package_cache/*

PKG=com.android.packageinstaller

am start -n "$PKG/com.rosan.installer.ui.activity.SettingsActivity" >/dev/null 2>&1 && exit 0
am start -n "$PKG/com.rosan.installer.ui.activity.LauncherAlias" >/dev/null 2>&1 && exit 0
monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
