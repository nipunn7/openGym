# iPhone app via TestFlight (no Mac needed)

`.github/workflows/ios-testflight.yml` builds the iPhone app on a GitHub-hosted Mac, signs it
with your Apple Developer account and uploads it to TestFlight. You install it from Apple's
TestFlight app. Each build works for 90 days, and every push to the branch makes a new one.

You do the steps below **once**. Apple only lets the account owner do them.

## 1. Register the app ID (developer.apple.com)

1. developer.apple.com/account → **Certificates, IDs & Profiles** → **Identifiers** → **+**
2. **App IDs** → **App** → Continue
3. Description: `openGym` · Bundle ID: **Explicit** → `com.nipungupta.opengym`
4. Continue → Register. You don't need to tick any capabilities.

While you're there, note your **Team ID**: it's under **Membership details** (10 characters,
e.g. `AB12CD34EF`).

## 2. Create the app (appstoreconnect.apple.com)

1. **Apps** → **+** → **New App**
2. Platform **iOS** · Name: anything not already taken on the App Store, e.g. `openGym Nipun`
   (only you will see it) · Language: English · Bundle ID: pick `com.nipungupta.opengym` ·
   SKU: `opengym` · User Access: Full Access
3. Create. You don't need to fill in anything else. TestFlight for yourself needs no App Review.

## 3. Create an API key (App Store Connect)

1. **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys** → **+**
2. Name `github-actions`, Access: **Admin**. Admin is likely needed so the build can create
   the signing certificate by itself.
3. **Download** the `.p8` file. Apple only lets you download it **once**.
4. On the same page, note the **Key ID** (next to the key) and the **Issuer ID** (above the list).

## 4. Add four secrets to GitHub

github.com/nipunn7/openGym → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, four times:

| Name | Value |
|---|---|
| `APPLE_TEAM_ID` | your Team ID from step 1 |
| `ASC_KEY_ID` | the Key ID from step 3 |
| `ASC_ISSUER_ID` | the Issuer ID from step 3 |
| `ASC_KEY_P8` | the **whole text** of the `.p8` file. Open it in TextEdit and copy everything, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

These are stored encrypted. They never appear in the code or the logs.

## 5. Run it

GitHub → **Actions** → **iOS → TestFlight** → **Run workflow** (branch
`claude/gym-coach-app-0bvore`). It takes about 10–20 minutes. After that, every push to that
branch that touches the app builds a new version automatically.

Once it uploads, Apple "processes" the build for another 5–15 minutes. It then appears in App
Store Connect → your app → **TestFlight**.

## 6. Install on your iPhone

1. In App Store Connect → your app → **TestFlight** → **Internal Testing** → **+** → create
   a group (e.g. `Me`) and add yourself.
2. On the iPhone, install **TestFlight** from the App Store and sign in with the same Apple ID.
3. Open the invite (email, or directly in TestFlight) → **Install**.

New builds show up in TestFlight and can update automatically.

## Good to know

- **Data stays on the phone.** The iPhone app has no account and no sync: everything
  (including progress photos) is stored inside the app. Use Settings → Export for backups.
  Deleting the app deletes the data; updating it through TestFlight keeps it.
- **Apple Health:** in your Shortcut, use **Copy to Clipboard**, then tap **From Health** in the
  app's check-in. See `docs/COACH.md`.
- **Cost:** if the repo is private, GitHub counts Mac build minutes at 10× against your free
  allowance (about 200 Mac minutes per month on the free plan). Each build takes roughly
  10–20 minutes. Making the repo public makes them free.
- **If a run fails**, the log names the step. The first run is the most likely to need a
  fix (usually signing).
