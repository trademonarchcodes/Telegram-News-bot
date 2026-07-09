# Telegram News Bot (GitHub Actions edition)

Posts AI, Crypto, Forex, Synthetic Indices, Oil, Stocks, and Global news to your
Telegram channel every 15 minutes, sourced from free RSS feeds. Runs entirely
on GitHub Actions' free tier — no server or paid hosting required.

Unlike the always-on version, this runs as a short script triggered on a
schedule. It has no long-lived memory, so it persists the list of already-posted
article IDs to `seen.json` and commits that file back to the repo after each run.

## Setup (5 minutes)

1. **Create a new GitHub repository** (public or private, either works) and
   push the contents of this folder to it as the repo root:

   ```bash
   cd github-bot-export
   git init
   git add .
   git commit -m "Initial commit: Telegram news bot"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Add your bot token as a secret** (Settings → Secrets and variables →
   Actions → New repository secret):
   - Name: `TELEGRAM_BOT_TOKEN`
   - Value: your bot token from [@BotFather](https://t.me/BotFather)

3. **Add your channel ID as a variable** (same page, "Variables" tab → New
   repository variable):
   - Name: `TELEGRAM_CHANNEL_ID`
   - Value: `-1003622016118`

4. **Make sure your bot is an admin of the channel** — it needs posting
   rights, or every send will fail.

5. **Enable Actions** if prompted (Settings → Actions → General → allow
   workflows to run), and confirm the "Post news to Telegram" workflow shows
   up under the Actions tab.

That's it. The workflow runs automatically every 10 minutes, from 8:00am to
11:50pm Africa/Lagos time (WAT, UTC+1) — nothing posts between midnight and
8am. GitHub may add a few extra minutes of delay under load — this is normal
for scheduled Actions, and is more noticeable on tight (10-min) schedules
since GitHub deprioritizes scheduled runs during high global load.

**Make the repo public.** GitHub Actions gives unlimited free minutes on
public repos (private repos are capped at 2,000 min/month). There's nothing
secret in this code — your bot token lives in GitHub Secrets, not in any
file here — so it's safe to make public.

## First run

The very first run only seeds `seen.json` with all currently-available
articles and does **not** post anything — this avoids dumping potentially
months of backlog into your channel at once. Real posts start from the second
run onward (~15 minutes later).

## Manual trigger

You can trigger a run on demand from the Actions tab → "Post news to
Telegram" → "Run workflow", without waiting for the schedule.

## Free tier limits

GitHub Actions gives every account 2,000 free minutes/month (unlimited for
public repos). Each run of this bot takes well under a minute, and running
every 15 minutes uses roughly 3,000 runs/month × ~30s each ≈ 25 hours — safely
within free-tier bounds even for a private repo. If you ever see runs stop
happening, check Settings → Billing for usage caps.

## Files

- `bot.mjs` — the bot logic (fetch feeds, dedupe, post to Telegram)
- `feeds.mjs` — the list of RSS feed sources by category
- `seen.json` — ledger of already-posted article IDs (auto-updated by the
  workflow after each run — don't edit by hand)
- `.github/workflows/news-bot.yml` — the scheduled GitHub Actions workflow
