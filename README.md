# SLEEP.

Your nights, without logging anything. Your Apple Watch records your sleep; the YOU watch app reads it from Apple Health each morning and saves it here: how long you slept, when you went to bed and woke up, deep, core and REM sleep, time awake, and resting heart rate. One page, no build step, your data in your own Supabase database, on the same login as your other apps.

## What's on the page

- **Last night**: hours asleep, bedtime to wake time, and whether you met your sleep goal.
- **Tiles**: your 7-night average, how many of the last 7 nights met your goal, and your usual bedtime and wake time with how much they vary.
- **Hours asleep** for the last 30 nights, with your goal as a dashed line, and **last night's stages**.
- **Nights**: every night with its times, stages and resting heart rate, and a CSV download.
- **Sleep goal**: set the hours you're aiming for (8 to start).
- **Your coach**: press the button and Claude reads your last 30 nights and tells you how your sleep is going and one change to try. Nothing is sent until you press it.

## Set up (about 10 minutes)

1. **Supabase.** Use the same project as your other apps. In **SQL Editor**, paste [setup.sql](setup.sql) and click **Run**. (Already done if Claude set it up for you; running it again is safe.)
2. **Vercel.** Import this repository at vercel.com → Add New → Project. Framework preset **Other**, no build command, root directory blank.
3. **Environment variables** on that Vercel screen:
   - `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` → the same two values as your other apps
   - `ANTHROPIC_API_KEY` → for the coach (and `ANTHROPIC_WORKSPACE_ID` if your key isn't scoped to a workspace)
   - `URL_HOME` → your YOU page's address, for the house button
4. **Deploy**, open the URL and sign in.
5. **Your watch.** Turn on Sleep tracking (iPhone Health app → **Browse → Sleep → Get Started**), wear your watch to bed, and open the YOU watch app once so it can ask to read Sleep. From then on each night arrives in the morning, through a background refresh at about 9am or whenever you open the app.

Vercel redeploys on every push to `main`.

## Run locally

```
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node dev.js
```

Then open http://localhost:8803. The coach only runs on Vercel.

## What's in it

- `index.html`: the page and its styles
- `sleep.js`: sign-in, loading, the tiles, chart, stages, nights list and goal
- `coach.js` and `api/coach.mjs`: the coach card and the Vercel function behind it
- `quote-of-day.js`: a quote that changes at local midnight
- `api/config.js`: hands the public Supabase settings and your YOU address to the page
- `setup.sql`: the `sleep_nights` and `sleep_goals` tables, locked to each user by row-level security

The nights themselves are written by the YOU watch app (`watch/GYMWatch/SleepSync.swift` in the GYM repository).

## Add to your iPhone home screen

Open the site in Safari, tap Share, then **Add to Home Screen**.

## Settings

Theme (system, dark or light), font, time zone and when your day ends are set once in YOU's **Settings** tab (the gear next to the home button opens it) and saved to your account; this app reads them when you sign in and keeps a copy on the device. It keeps its own colour. "Today" follows your time zone and when your day ends, so something logged at 1 AM with "day ends at 3 AM" counts toward the day before. Needs `settings.js` and YOU's `settings.sql`.
