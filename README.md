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

## What the workflow does

1. Resolves the latest upstream **Preview** pre-release tag (or a ref you pass).
2. Checks out upstream source at that tag.
3. Builds the online AOSP variant: `assembleOnlinePreviewRelease -PAPP_ID=com.android.packageinstaller`.
4. Packs a flashable module mirroring the official layout
   (`system/priv-app/PackageInstaller/PackageInstaller.apk` + module scripts).
5. Uploads the zip as an artifact and a draft pre-release.

## Usage

Push this folder to a new GitHub repo, then run the **Build InstallerX AOSP
Module** workflow from the Actions tab.

Input:
- `ref`: blank to auto-pick the latest Preview pre-release, or an explicit tag/branch.

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