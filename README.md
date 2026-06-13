# InstallerX AOSP Module Builder

Manually-triggered GitHub Action that rebuilds the InstallerX-Revived
**AOSP system installer module** from upstream source, because upstream stopped
shipping the module zip.

## Why build from source

The official module''s APK has package name `com.android.packageinstaller`, not
the public `com.rosan.installer.x.revived` release assets. It is produced by
overriding `applicationId` at build time (`-PAPP_ID=com.android.packageinstaller`).
That APK is never published as a release asset, so re-zipping a downloaded
release APK cannot reproduce the module: the wrong package name would not occupy
the system PackageInstaller slot, and the privileged permissions
(`INSTALL_PACKAGES`, `DELETE_PACKAGES`, ...) would not be granted.

The official module therefore carries **no** `privapp-permissions` allowlist of
its own; it reuses the system''s existing `com.android.packageinstaller`
privileged entry by replacing that package in `/system/priv-app`.

## What the workflows do

1. `Telegram Bot` polls your bot commands every 5 minutes.
2. `/build` triggers the module workflow for the latest upstream **Preview** pre-release tag.
3. `/build <ref>` triggers a build for a specific upstream tag or branch.
4. `Build InstallerX AOSP Module` checks out upstream source and builds the online AOSP variant:
   `assembleOnlinePreviewRelease -PAPP_ID=com.android.packageinstaller`.
5. It packs a flashable module mirroring the official layout
   (`system/priv-app/PackageInstaller/PackageInstaller.apk` + module scripts).
6. It uploads the zip as an artifact, publishes a draft pre-release, and sends the zip to Telegram.

## Usage

Send one of these commands to your Telegram bot:

- `/build`: build the latest upstream Preview and send the module zip.
- `/build <ref>`: build a specific upstream tag or branch.
- `/status`: show recent build runs.
- `/help`: show commands.

The workflow always builds the **online** variant.

## Signing (optional)

Without signing secrets the release APK is signed with the debug keystore, which
is fine for personal flashing. To match a stable signature, set repo secrets:
`SIGNING_KEY_STORE_BASE64`, `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS`,
`SIGNING_KEY_PASSWORD`.

> A module replacing the system PackageInstaller is signed with your key, not
> the platform key. This is expected for priv-app replacement modules and works
> on Magisk / KernelSU / APatch, but it is not a platform-signed component.

## Layout

```
.github/workflows/build-aosp-module.yml   manual build + pack workflow
module-template/                           official module files (verbatim)
scripts/pack-module.sh                     assembles the module zip
```
