#!/system/bin/sh

# Use the same launcher alias as the desktop icon.
# KernelSU action execution must follow the exact visible entrypoint.
am start -n com.android.packageinstaller/com.rosan.installer.ui.activity.LauncherAlias >/dev/null 2>&1 || true

rm -rf /data/system/package_cache/*
