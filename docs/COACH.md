# Coach mode

The **Coach** tab turns openGym into a day-by-day coach. You tell it about yourself and
your gym once; after that it tells you what to do each day, and how much.

## What it does

1. **Builds a plan from your gym.** You tick the equipment your gym has (barbell, dumbbells,
   cable station, leg press, lat pulldown, …). The coach only picks exercises you can do there.
2. **Picks a split from your days.** 6 days → Push/Pull/Legs ×2, 5 → Upper/Lower/Push/Pull/Legs,
   4 → Upper/Lower ×2, 3 → Full Body A/B/C, 1–2 → Full Body.
3. **Sets sets, reps and a starting weight.** These depend on your goal (strength, muscle, fat
   loss, general), experience, body weight, sex and age. Beginners get machines first and
   intermediate or advanced lifters get free weights first. First-session weights are
   *deliberately light guesses*. From the second session on, every number comes from what you
   actually logged, through the app's existing progression rules (linear for strength,
   double progression otherwise, with deloads when you stall).
4. **Runs as a queue, not a calendar.** Your sessions run in order on your training days.
   Miss Tuesday and Wednesday gives you Tuesday's session. Nothing is skipped; the rest of the
   week shifts back by one.
5. **Reads a morning check-in.** You enter sleep, energy, soreness, resting heart rate and HRV.
   - All fine → train as planned.
   - One or two warning signs → *lighter day*: same weights, one set fewer per exercise.
   - Several warning signs → it suggests rest. Your session waits for tomorrow.
   - Heart numbers are compared with **your own** median from earlier check-ins (after 4 of
     them), never with population averages.
   - More than 14 days since your last workout → weights eased 10% for the first session back.

6. **Swap an exercise.** Machine taken? Tap the shuffle button on an exercise during a
   workout to swap it for another that does the same job. That's for today only, unless
   you turn on "keep the swap in my plan". Swapping from the Coach page changes the plan.
   Only equipment you've ticked is offered.
7. **Weekly review.** Sessions done vs planned (ring), time, volume, which lifts got
   stronger (top weight vs. everything before that week), sets per body part, and one tip
   for next week. Monday and Tuesday open on last week's review.
8. **Home is the coach screen.** With the coach on, Home shows the check-in, today's session
   and the weekly review first. The check-in shrinks to one line once saved.

9. **Body page** (Home → Body card). Log waist, chest, arm, hips, thigh and neck, each with a
   chart. Measurements are stored in cm and shown in inches for a pound profile. Body fat is
   estimated with the US Navy tape method (waist, neck and height, plus hips for women). That
   method can be a few percent off for any one person; the trend is what matters. Progress
   photos (front / side / back) can be compared side by side. **Photos stay on the device:**
   they live in the browser's IndexedDB, resized to 1080 px, and are not synced or included
   in backups. Reminders appear after 14 days without measuring and 28 days without a photo.

The plans it builds are normal routines. You can open any of them in the **Plan** tab and swap
an exercise, change sets or reps, or delete one.

> These are general training rules of thumb, not medical advice. If something hurts (not just
> muscle soreness), or you have a heart condition, ask a doctor or physio first.

## Apple Watch / Apple Health

A web app **cannot read Apple Health directly**. iOS only lets native apps use HealthKit.
There are two ways to get your Watch data in:

### Option A: an iOS Shortcut (recommended, about 5 minutes to set up)

The **Shortcuts** app *can* read Health data, so it does the reading for the coach.

1. Open **Shortcuts** → **+** → name it `Gym check-in`.
2. Add **Find Health Samples**: Type **Resting Heart Rate**, sort by **Start Date**, **Latest
   First**, limit **1**.
3. Add **Find Health Samples** again: Type **Heart Rate Variability**, same settings.
4. Optionally add another for **Weight** (Body Mass).
5. Add a **Text** action and type the line below. Insert each value where shown (tap the
   variable → choose the matching *Health Samples* → *Value*):
   ```
   rhr=[Resting HR value]&hrv=[HRV value]&weight=[Weight value]
   ```
   You can add `&sleep=7.5` by hand, or leave sleep out and type it in the app (Apple's sleep
   data comes as many separate segments, which are awkward to add up in Shortcuts).
6. Finish with **one** of these:
   - **Copy to Clipboard**, then open openGym → Coach → **From Health**. It reads the
     clipboard. This works with the home-screen app.
   - **Open URLs** with `https://YOUR-OPENGYM-ADDRESS/#/coach?` followed by the Text. This
     opens in Safari.

   **Important:** on iPhone, a web app added to the home screen keeps its data **separately
   from Safari**. If you use openGym without an account (guest mode), the *Open URLs* route
   saves your vitals into Safari's copy, not your home-screen app. Use the clipboard route, or
   sign in with a passkey on a self-hosted instance so both copies sync.
7. Optional: **Automation** → **Time of Day** (e.g. 07:00) → run `Gym check-in`, so it's ready
   when you open the app.

The app accepts `key=value` pairs separated by `&`, `;` or new lines. Keys: `sleep` (hours;
values over 24 are read as minutes), `rhr`, `hrv` (ms), `weight`, `energy` (1–5),
`soreness` (1–5). Values outside a sane range are ignored.

### Option B: the Health export file (body weight only)

Settings → *Import from another app* already reads Apple Health's `export.zip` → `export.xml`
for body-weight history. It does not import heart data.

### Option C: native app (not built)

The repo contains a Capacitor iOS project (`frontend/ios`). Adding a HealthKit plugin there
would allow automatic syncing. It needs a Mac with Xcode and an Apple developer account to
install on your phone, so it isn't done here.

## Where it lives in the code

- `frontend/src/lib/coach.js`: equipment list, exercise choices per movement, plan generator,
  rotation scheduling, readiness rules, vitals parsing (pure functions).
- `frontend/src/lib/coach.test.js`: tests for all of the above.
- `frontend/src/lib/review.js` (+ tests): the weekly review.
- `frontend/src/lib/body.js` (+ tests), `lib/photos.js`, `views/Body.jsx`: measurements, body fat, photos.
- `frontend/src/views/Coach.jsx`: the Coach tab, plus the cards Home reuses.
- `history.js` `effectiveRoutineId`: uses the rotation while the coach is on.
- `sheets.jsx` `beginWorkout`: applies the lighter-day / comeback adjustment.
