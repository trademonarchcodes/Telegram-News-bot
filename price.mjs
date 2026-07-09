// Bitcoin price tracker — checks the current BTC price (in USD, NGN, and a
// few other currencies), converts it for context, and posts an alert when a
// new all-time high/low is hit or the price has moved sharply since the
// last check. Persists its state to price-state.json so it survives across
// GitHub Actions runs (fresh container every time).
import { readFile, writeFile } from "node:fs/promises";

const PRICE_STATE_FILE = new URL("./price-state.json", import.meta.url);

// Vs currencies we report on. NGN (Nigeria) is highlighted per request, plus
// a spread of other notable economies.
const VS_CURRENCIES = ["usd", "ngn", "gbp", "eur", "ghs", "kes", "zar", "inr"];

const CURRENCY_LABEL = {
  usd: "🇺🇸 USD",
  ngn: "🇳🇬 NGN",
  gbp: "🇬🇧 GBP",
  eur: "🇪🇺 EUR",
  ghs: "🇬🇭 GHS",
  kes: "🇰🇪 KES",
  zar: "🇿🇦 ZAR",
  inr: "🇮🇳 INR",
};

// Alert if price moves at least this much since the last check.
const MOVE_ALERT_PCT = 3;

function formatAmount(amount, currency) {
  const decimals = amount >= 1000 ? 0 : 2;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

async function loadState() {
  try {
    const raw = await readFile(PRICE_STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { athUsd: 0, atlUsd: Infinity, lastUsd: null };
  }
}

async function saveState(state) {
  await writeFile(PRICE_STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPrices() {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${VS_CURRENCIES.join(",")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
  const json = await res.json();
  const prices = json.bitcoin;
  if (!prices || typeof prices.usd !== "number") throw new Error("Unexpected CoinGecko response shape");
  return prices;
}

function buildPriceTable(prices) {
  return VS_CURRENCIES.map((c) => `${CURRENCY_LABEL[c]}: ${formatAmount(prices[c], c)}`).join("\n");
}

/**
 * Checks the current BTC price against stored state and returns an alert
 * article (matching the RSS article shape so bot.mjs can post it through
 * the same pipeline) if a new all-time high/low or a sharp move occurred.
 * Returns null when there's nothing alert-worthy this run.
 */
export async function checkBitcoinPrice() {
  let prices;
  try {
    prices = await fetchPrices();
  } catch (err) {
    console.warn(`[warn] Bitcoin price check failed: ${err.message}`);
    return null;
  }

  const state = await loadState();
  const usd = prices.usd;

  let reason = null;
  if (state.athUsd === 0) {
    // First run — seed state, no alert.
    state.athUsd = usd;
    state.atlUsd = usd;
    state.lastUsd = usd;
    await saveState(state);
    return null;
  }

  if (usd > state.athUsd) {
    reason = "🚀 NEW ALL-TIME HIGH";
    state.athUsd = usd;
  } else if (usd < state.atlUsd) {
    reason = "📉 NEW LOCAL LOW";
    state.atlUsd = usd;
  } else if (state.lastUsd) {
    const pctMove = ((usd - state.lastUsd) / state.lastUsd) * 100;
    if (Math.abs(pctMove) >= MOVE_ALERT_PCT) {
      reason = pctMove > 0
        ? `⚡ SHARP MOVE: +${pctMove.toFixed(1)}% since last check`
        : `⚡ SHARP MOVE: ${pctMove.toFixed(1)}% since last check`;
    }
  }

  state.lastUsd = usd;
  await saveState(state);

  if (!reason) return null;

  const title = `Bitcoin ${reason} — $${formatAmount(usd, "usd")}`;
  const body = buildPriceTable(prices);

  return {
    guid: `btc-price-${Date.now()}`,
    title,
    link: "https://www.coingecko.com/en/coins/bitcoin",
    imageUrl: null,
    pubDate: new Date(),
    isPriceAlert: true,
    priceBody: body,
    source: { name: "CoinGecko", category: "₿ Crypto" },
  };
}
