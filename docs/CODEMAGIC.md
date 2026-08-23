# Shipping OpenGymN to your iPhone via Codemagic + TestFlight

This builds the **standalone** flavour of openGym — the Capacitor app described in
[MOBILE.md](MOBILE.md). It talks to **no backend at all**: no account, no sync, no
server, no VPS. Your data lives in the app's private storage on the phone, and
exercise media comes from the jsDelivr CDN.

Everything below assumes a **paid Apple Developer Program** membership.

---

## Why TestFlight and not a direct install

Apple does not allow installing apps outside the App Store. A free Apple ID can
sign an app onto your own phone from Xcode, but the signature dies after 7 days
and CI cannot do it at all (free Apple IDs have no App Store Connect API access).

TestFlight sidesteps all of that: builds last **90 days**, install and update
happen from the TestFlight app on the phone, and no cable or Mac is involved.
Internal-tester builds skip Apple's beta review entirely.

**Licensing:** openGym is AGPL-3.0, which normally conflicts with Apple's terms.
[`NOTICE.md`](../NOTICE.md) grants an explicit additional permission under AGPL §7
covering app-store distribution, so this is allowed.

---

## One-time setup

### 1. App Store Connect API key — you probably already have this

An App Store Connect API key is **account-wide, not per-app**. If you already have
an integration in Codemagic (for another app), reuse it and skip this step —
`codemagic.yaml` references it by name.

If you need a new one:

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**
2. **+**, give it a name, role **App Manager** (or Admin)
3. Download the `.p8` — **Apple lets you download it exactly once**
4. Note the **Issuer ID** and **Key ID** shown on that page
5. Codemagic → **Teams → Integrations → Apple Developer Portal → Connect**, upload
   the `.p8` with the Issuer ID and Key ID

Then update the `integrations.app_store_connect` name in `codemagic.yaml` to match.

### 2. Register the app in App Store Connect

1. App Store Connect → **Apps** → **+** → **New App**
2. Platform **iOS**, bundle ID `com.nipungupta.opengym`
   - If it isn't in the dropdown: Developer portal → **Identifiers** → **+** →
     App IDs → App, register `com.nipungupta.opengym` first
3. Any name and SKU you like — nothing is ever submitted for App Store review

Signing is fully automatic from here. **No certificates ever touch your Windows machine.**

### 3. Add yourself as an internal tester

App Store Connect → your app → **TestFlight** → **Internal Testing** → add your
Apple ID. Install the **TestFlight** app on your iPhone with the same Apple ID.

### 4. Connect the repo

Codemagic → **Add application** → your fork → it picks up `codemagic.yaml` automatically.

---

## Cutting a build

Builds are **tag-triggered, never push-triggered** — deliberately. Codemagic's free
tier gives 500 macOS minutes/month, and building on every push burns them on
commits that didn't need a native build.

```bash
git tag build-2026-08-23 && git push origin build-2026-08-23
```

Codemagic builds, signs, and uploads. Apple processes the build (5–15 min), then
it appears in TestFlight on your phone.

---

## What the workflow does

| Step | Why |
|---|---|
| `npm ci \|\| npm install` | Tolerant install — a newer local npm can write a lockfile the runner's older npm rejects |
| `npm run build:mobile` | `VITE_MOBILE=1` build + `cap sync` into `ios/` |
| `pod install` | Podfile resolves from `../../node_modules`, so it must follow the npm install |
| `xcode-project use-profiles` | Applies the fetched signing profiles |
| version/build number | Marketing version from `frontend/package.json`; build number from TestFlight or Codemagic's counter |
| `xcode-project build-ipa` | Archives and exports the signed `.ipa` |

---

## Repo changes this setup required

Four things had to change for CI to work at all:

1. **`codemagic.yaml`** — new.
2. **`frontend/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`** — new,
   and **essential**. Xcode creates schemes per-user when you *open* the project;
   they live in `xcuserdata/`, which is gitignored. CI never opens the GUI, so
   without a committed shared scheme `xcodebuild -scheme App` fails with
   *"scheme not found"*. This is the single most common way Capacitor iOS builds
   break on CI.
3. **Bundle ID** → `com.nipungupta.opengym` in `project.pbxproj` and
   `capacitor.config.json`. The upstream `ch.duartesantos.opengym` belongs to the
   original author's team and cannot be registered under yours.
4. **`ITSAppUsesNonExemptEncryption = false`** in `Info.plist`. Without it, every
   single TestFlight upload stalls asking you to answer the export-compliance
   question by hand in the web UI.

---

## Troubleshooting

**"Scheme App not found"** — the shared scheme file is missing or wasn't committed.
Check `git ls-files | grep xcscheme` returns a path.

**Build stuck "Processing" in TestFlight** — normal, 5–15 min. If it stalls longer,
check email for an Apple export-compliance or invalid-binary notice.

**Pod install fails** — almost always means the npm install step didn't run or
didn't complete; the Podfile reads from `frontend/node_modules`.

**Deployment target errors** — the project targets iOS 14.0. If Codemagic's pinned
Xcode drops support for it, raise `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj`.

**Re-syncing after web changes** — `npm run build:mobile` leaves `frontend/dist`
holding the *mobile* bundle. Run a plain `npm run build` before deploying `dist`
to a server.
