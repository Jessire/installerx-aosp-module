#!/system/bin/sh

# Launch the app through its launcher entry instead of a hard-coded Activity.
# This survives upstream class renames and avoids action-button crashes.
am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p com.android.packageinstaller >/dev/null 2>&1 || true

rm -rf /data/system/package_cache/*
