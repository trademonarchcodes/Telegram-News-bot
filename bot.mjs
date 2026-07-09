// Standalone Telegram news bot — designed to be triggered by GitHub Actions
// on a schedule (e.g. every 15 minutes). Each run: fetch feeds, keep only
// articles that look genuinely market-moving, check the Bitcoin price for
// new highs/lows, post everything qualifying, and persist a small "seen"
// ledger to seen.json so the next run (a fresh container) knows what it
// already posted.
import { readFile, writeFile } from "node:fs/promises";
import RSSParser from "rss-parser";
import { isMarketMoving } from "./filter.mjs";
import { checkBitcoinPrice } from "./price.mjs";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN env var is not set");
if (!TELEGRAM_CHANNEL_ID) throw new Error("TELEGRAM_CHANNEL_ID env var is not set");

const TELEGRAM_API = "https://api.telegram.org";
const SEEN_FILE = new URL("./seen.json", import.meta.url);
const MAX_SEEN = 3000;
const MAX_PER_RUN = 10;

const { FEED_SOURCES } = await import("./feeds.mjs");

const parser = new RSSParser({
  timeout: 10_000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0; +https://t.me/newsbot)",
  },
  customFields: {
    item: [
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["enclosure", "enclosure"],
    ],
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeHttpUrl(raw) {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function extractImage(item) {
  const mc = item["media:content"]?.$ ?? {};
  if (mc.url && (!mc.medium || mc.medium === "image")) {
    const url = safeHttpUrl(mc.url);
    if (url) return url;
  }
  const mt = item["media:thumbnail"]?.$ ?? {};
  if (mt.url) {
    const url = safeHttpUrl(mt.url);
    if (url) return url;
  }
  const enc = item.enclosure ?? {};
  if (enc.url && enc.type?.startsWith("image/")) {
    const url = safeHttpUrl(enc.url);
    if (url) return url;
  }
  return null;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const BRAND_NAME = "MONARCH CODEX";
const BRAND_TAGLINE = "Global Market Intelligence";
const BRAND_FOOTER = `— <b>${escapeHtml(BRAND_NAME)}</b> · <i>${escapeHtml(BRAND_TAGLINE)}</i>`;

function formatCaption(article) {
  if (article.isPriceAlert) {
    return (
      `👑 <b>${escapeHtml(BRAND_NAME)}</b> MARKET ALERT\n\n` +
      `₿ <b>${escapeHtml(article.title)}</b>\n\n` +
      `<pre>${escapeHtml(article.priceBody)}</pre>\n` +
      `${BRAND_FOOTER}`
    );
  }
  return (
    `👑 <b>${escapeHtml(BRAND_NAME)}</b> | ${escapeHtml(article.source.category)}\n\n` +
    `<b>${escapeHtml(article.title)}</b>\n` +
    `📰 <i>${escapeHtml(article.source.name)}</i>\n\n` +
    `<a href="${escapeAttr(article.link)}">Read full article →</a>\n\n` +
    `${BRAND_FOOTER}`
  );
}

function withHardTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchFeed(source) {
  try {
    // rss-parser's own `timeout` option isn't always honored by every feed
    // (e.g. a server that accepts the connection but never sends a body), so
    // we enforce a hard backstop here too — a single slow feed must never be
    // able to hang the whole run.
    const feed = await withHardTimeout(parser.parseURL(source.url), 15_000, `Feed ${source.name}`);
    const articles = [];
    for (const item of feed.items ?? []) {
      const guid = item.guid ?? item.link ?? item.title;
      if (!guid || !item.title || !item.link) continue;
      let linkUrl;
      try {
        linkUrl = new URL(item.link.trim());
      } catch {
        continue;
      }
      if (linkUrl.protocol !== "http:" && linkUrl.protocol !== "https:") continue;
      articles.push({
        guid,
        title: item.title.trim(),
        contentSnippet: item.contentSnippet?.trim() ?? "",
        link: linkUrl.href,
        imageUrl: extractImage(item),
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        source,
      });
    }
    return articles;
  } catch (err) {
    console.warn(`[warn] Failed to fetch feed ${source.name}: ${err.message}`);
    return [];
  }
}

async function callTelegramApi(method, body) {
  const url = `${TELEGRAM_API}/bot${TELEGRAM_BOT_TOKEN}/${method}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(body),
      });

      if (res.ok) return true;

      const json = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const retryAfterMs = typeof json.parameters?.retry_after === "number"
          ? json.parameters.retry_after * 1000
          : 5_000;
        console.warn(`[warn] Telegram rate-limited (${method}), backing off ${retryAfterMs}ms`);
        await sleep(retryAfterMs);
        continue;
      }

      if (res.status >= 400 && res.status < 500) {
        console.error(`[error] Telegram permanent error (${method}): ${res.status} ${json.description ?? ""}`);
        return false;
      }

      console.warn(`[warn] Telegram server error (${method}): ${res.status}, retrying`);
      await sleep(2_000 * attempt);
    } catch (err) {
      console.warn(`[warn] Telegram network error (${method}): ${err.message}, retrying`);
      await sleep(2_000 * attempt);
    }
  }

  console.error(`[error] Telegram API failed after 3 attempts (${method})`);
  return false;
}

async function sendMessage(text) {
  return callTelegramApi("sendMessage", {
    chat_id: TELEGRAM_CHANNEL_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

async function sendPhoto(photoUrl, caption) {
  const ok = await callTelegramApi("sendPhoto", {
    chat_id: TELEGRAM_CHANNEL_ID,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
  });
  if (!ok) {
    console.log("[info] sendPhoto failed — falling back to text-only message");
    return sendMessage(caption);
  }
  return true;
}

async function loadSeen() {
  try {
    const raw = await readFile(SEEN_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.guids) ? parsed.guids : []);
  } catch {
    // File doesn't exist yet — this is the very first run.
    return null;
  }
}

async function saveSeen(seenSet) {
  let guids = [...seenSet];
  if (guids.length > MAX_SEEN) {
    guids = guids.slice(guids.length - MAX_SEEN);
  }
  await writeFile(SEEN_FILE, JSON.stringify({ guids }, null, 2));
}

async function postArticle(article) {
  const caption = formatCaption(article);
  return article.imageUrl ? await sendPhoto(article.imageUrl, caption) : await sendMessage(caption);
}

async function main() {
  console.log("[info] News cycle started");

  // Bitcoin price check runs independently of the "first run seeds, doesn't
  // post" rule below — it has its own state file and is always safe to post
  // once seeded, since it only fires on genuine highs/lows/sharp moves.
  const priceAlert = await checkBitcoinPrice();
  if (priceAlert) {
    const ok = await postArticle(priceAlert);
    console.log(ok ? `[info] Posted price alert: "${priceAlert.title}"` : "[warn] Failed to post price alert");
    await sleep(1200);
  }

  const results = await Promise.allSettled(FEED_SOURCES.map((src) => fetchFeed(src)));

  const allArticles = [];
  for (const result of results) {
    if (result.status === "fulfilled") allArticles.push(...result.value);
  }

  // Only keep articles that look like they'd actually move a global market
  // — Trump/political speeches, Fed/central bank moves, wars, big crypto or
  // stock moves, oil shocks, etc. — instead of every routine story.
  const relevantArticles = allArticles.filter(isMarketMoving);
  console.log(`[info] ${relevantArticles.length}/${allArticles.length} fetched articles passed the market-impact filter`);

  const existingSeen = await loadSeen();
  const isFirstRun = existingSeen === null;
  const seen = existingSeen ?? new Set();

  const newArticles = relevantArticles.filter((a) => !seen.has(a.guid));
  newArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  if (isFirstRun) {
    // Seed with ALL fetched articles (not just relevant ones) so we don't
    // re-evaluate old backlog against the filter on the next run.
    for (const article of allArticles) seen.add(article.guid);
    await saveSeen(seen);
    console.log(`[info] First run: seeded seen cache with ${allArticles.length} articles, no posts sent`);
    return;
  }

  const toPost = newArticles.slice(0, MAX_PER_RUN);
  console.log(`[info] Found ${newArticles.length} new market-moving articles, posting up to ${toPost.length}`);

  for (const article of toPost) {
    const ok = await postArticle(article);

    if (ok) {
      seen.add(article.guid);
      console.log(`[info] Posted: "${article.title}" (${article.source.name})`);
    } else {
      console.warn(`[warn] Failed to post "${article.title}" — will retry next run`);
    }

    await sleep(1200);
  }

  // Mark all fetched (not just relevant) articles as seen so filtered-out
  // noise doesn't get re-evaluated every run either.
  for (const article of allArticles) seen.add(article.guid);
  await saveSeen(seen);
  console.log("[info] News cycle complete");
}

await main();
