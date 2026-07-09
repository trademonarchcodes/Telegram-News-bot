# Telegram News Bot (GitHub Actions edition)

Posts **market-moving** news to your Telegram channel — the kind of story
that actually shifts prices: Trump/political speeches, Fed and central bank
decisions, wars and geopolitics, big Bitcoin/crypto moves, Michael
Saylor/MicroStrategy buys, stock market shocks, oil shocks, and major AI
developments. Routine, low-impact stories from the same feeds are filtered
out. It also posts a dedicated **Bitcoin price alert** whenever BTC hits a
new all-time high, a new local low, or moves sharply, showing the price in
USD, Nigerian Naira, and several other currencies.

Sourced from free RSS feeds plus the free CoinGecko price API. Runs entirely
on GitHub Actions' free tier — no server or paid hosting required.

Unlike an always-on bot, this runs as a short script triggered on a
schedule. It has no long-lived memory, so it persists state to `seen.json`
(posted article IDs) and `price-state.json` (BTC high/low/last price) and
commits those files back to the repo after each run.

## What changed from the original version

- **Relevance filter (`filter.mjs`)** — every fetched article is scored
  against two keyword sets before it's allowed to post:
  - High-impact keywords that matter regardless of category: Trump, Fed/
    FOMC/Powell, wars and geopolitics, tariffs, elections, OPEC, market
    crashes, etc.
  - Category-specific keywords (crypto, forex, stocks, oil, AI) — e.g. a
    crypto article must mention Bitcoin, Saylor, an ETF, a whale move, an
    exchange, etc. — not just be tagged "crypto" by the feed.
  - "🌍 Global News" is the noisiest category, so it requires a high-impact
    hit specifically (a Trump speech, a war, a Fed move) rather than any
    world-news headline.
- **Bitcoin price tracker (`price.mjs`)** — checks BTC's price every run via
  CoinGecko (no API key needed) and posts an alert on a new all-time high,
  new local low, or a move of 3%+ since the last check, converted to USD,
  NGN, GBP, EUR, GHS, KES, ZAR, and INR.

## Setup (5 minutes)

1. **Create a new GitHub repository** (public or private, either works) and
   push the contents of this folder to it as the repo root:

   ```bash
   cd telegram-news-bot
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
   - Value: your channel's numeric ID (e.g. `-1003622016118`)

4. **Make sure your bot is an admin of the channel** — it needs posting
   rights, or every send will fail.

5. **Enable Actions** if prompted (Settings → Actions → General → allow
   workflows to run), and confirm the "Post news to Telegram" workflow shows
   up under the Actions tab.

That's it. The workflow runs automatically every 10 minutes, from 8:00am to
11:50pm Africa/Lagos time (WAT, UTC+1) — nothing posts between midnight and
8am. GitHub may add a few extra minutes of delay under load — this is normal
for scheduled Actions.

**Make the repo public.** GitHub Actions gives unlimited free minutes on
public repos (private repos are capped at 2,000 min/month). There's nothing
secret in this code — your bot token lives in GitHub Secrets, not in any
file here — so it's safe to make public.

## First run

The very first run only seeds `seen.json` and `price-state.json` with
current data and does **not** post anything — this avoids dumping backlog
into your channel at once. Real posts start from the second run onward.

## Tuning the filter

Open `filter.mjs` and edit the `HIGH_IMPACT_KEYWORDS` and `CATEGORY_KEYWORDS`
lists to make the bot stricter or looser. Add names, tickers, or terms you
care about (e.g. a specific company or politician) to get more coverage of
them; remove terms that are still letting through stories you don't want.

## Manual trigger

You can trigger a run on demand from the Actions tab → "Post news to
Telegram" → "Run workflow", without waiting for the schedule.

## Free tier limits

GitHub Actions gives every account 2,000 free minutes/month (unlimited for
public repos). Each run of this bot takes well under a minute, and running
every 10 minutes uses well under free-tier bounds even for a private repo.

## Files

- `bot.mjs` — the bot logic (fetch feeds, filter for market impact, dedupe,
  check BTC price, post to Telegram)
- `filter.mjs` — the market-impact relevance filter and its keyword lists
- `price.mjs` — the Bitcoin price tracker (CoinGecko, multi-currency, high/
  low/sharp-move alerts)
- `feeds.mjs` — the list of RSS feed sources by category
- `seen.json` — ledger of already-posted article IDs (auto-updated)
- `price-state.json` — BTC all-time high/low/last-seen price (auto-updated)
- `.github/workflows/news-bot.yml` — the scheduled GitHub Actions workflow
