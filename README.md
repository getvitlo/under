# Under

A daily spend cap for two people. One shared ledger, one screen each morning
telling you what's left today.

Static site — GitHub Pages hosts it, Supabase holds the shared data, and it
works offline either way.

---

## 1. Put it on GitHub

1. Create a new repository — call it `under`. **Public** is fine; nothing secret
   lives in the code except your household id (see the warning in step 3).
2. Upload every file in this folder to the root of the repo.
3. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Wait a minute, then open `https://<your-username>.github.io/under/`.

The `.nojekyll` file is there on purpose — without it GitHub ignores some files.

## 2. Add it to the home screen

**iPhone:** open the link in Safari → Share → Add to Home Screen.
**Android:** Chrome will offer "Install app".

It then opens full screen with no browser chrome, and works with no signal.

## 3. Accounts and one shared ledger

You each sign in with your own email. The books are shared; the screens aren't.

1. Make a free project at [supabase.com](https://supabase.com).
2. SQL Editor → New query → paste everything in **`supabase.sql`** → Run.
   (Safe to run over the earlier no-login version — it replaces the old policies.)
3. Project Settings → API. Copy the **Project URL** and the **anon public** key.
4. Open `config.js` and fill in:

```js
supabaseUrl: "https://xxxxxxxx.supabase.co",
supabaseAnonKey: "eyJhbGciOi...",
householdId: "a-long-random-string-you-both-type-once"
```

5. Commit. Open the site, tap **Create account**, and do the same on her phone
   with her own email.
6. First time each of you signs in, the app asks which of you you are and for
   the household code. Enter the same code on both and the two accounts are
   looking at the same books.

**Email confirmation.** Supabase asks new accounts to confirm by email by
default. Either click the link it sends, or turn it off: Authentication →
Sign In / Providers → Email → uncheck *Confirm email*. For two known people
that's fine.

**Now it's actually private.** The database only returns rows belonging to your
household, and only to someone signed in. The anon key on its own gets nobody
anything. The household code is an invite code, not a password — anyone with it
*and* an account on your project could join, so don't paste it anywhere public.

## 4. Make it yours

Everything you'd want to change is in `config.js`:

```js
people: [{ key: "H", name: "Hani" }, { key: "F", name: "Fatima" }],
defaultCap: 4.5,
currency: "BHD",
```

Caps are per person and editable in the app afterwards — the config value is
only the starting point. Currencies: BHD KWD OMR AED SAR QAR GBP USD EUR.

---

## How it works

**Your screen is yours. The money is shared.**

*Today* is your own: your cap, your spending, your ten days. Underneath, one
quiet line shows what she's spent today and anything joint — enough to know
where the day stands without her receipts filling your screen.

*Month* and *Insights* are the shared pages. Both of you, side by side, with a
filter across the top: you, her, joint, or both. Tap any purchase — hers
included — to open and fix it. It's a joint budget; correcting a typo for each
other is the point.

**The cap is a ceiling, not a bill.** 4.500 each means the most either of you
spends in a day. Spend 1.200 and you've spent 1.200 — the rest never left the
account. Nothing in the app treats the cap as money owed.

**Logging.** Type what you bought and the price on one line:

| You type | What happens |
|---|---|
| `coffee 1.6` | Coffee, Daily, logged to whoever the phone is set to |
| `coffee 1.6, sandwich 0.6` | Two entries |
| `F: lunch 2.4` | Logged as her spending, from your phone |
| `J: dinner 12` | Joint — counts for the day, against neither cap |
| `shoes 22` | Recognised as a one-off, kept outside the cap |
| `taxi 2.5 !` | Force a one-off |
| `lunch 3 #groceries` | Force a category |
| `y karak 0.3` | Log it to yesterday |

Categories come from a keyword list in `app.js` — add your own to `KEYWORDS`.

**Roll unspent money forward** (Settings) banks whatever you come in under, so a
cheap Monday gives you a bigger Tuesday. Resets each month.

**Month** has a cumulative chart against the cap line, a slider to walk through
the month day by day, and a filter for you / them / joint / both.

## Files

| File | What it is |
|---|---|
| `index.html` | Markup for all four screens |
| `app.css` | Everything visual |
| `app.js` | UI, parsing, charts |
| `store.js` | Accounts, local cache, Supabase sync |
| `config.js` | The only file you need to edit |
| `supabase.sql` | Run once in Supabase |
| `sw.js` | Offline support — bump `CACHE` when you change files |

## If something's wrong

**"Couldn't join" when entering the household code.** You're signed in but the
`profiles` insert was refused — usually `supabase.sql` hasn't been run, or was
run before the account existed. Run it again and retry.

**Changes aren't appearing on the other phone.** Settings shows the sync state.
Amber means changes are queued, red means it can't reach Supabase. Both keep
working locally and catch up on their own.

**The app doesn't update after you edit a file.** The service worker caches it.
Change `CACHE = "under-v1"` to `v2` in `sw.js` and reload twice.

**Everything vanished.** Settings → Export on the other phone, then Import here.

**Starting over with an account.** Delete the row in `profiles` for that user in
Supabase and sign in again — it'll ask who you are next time.
