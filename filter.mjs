// Market-impact relevance filter.
//
// The raw RSS feeds contain a lot of noise (product reviews, listicles,
// routine announcements) mixed in with genuinely market-moving news. This
// module scores each article and only lets through the ones that actually
// look like they'd move the price of Bitcoin, forex pairs, stocks, oil, or
// broader risk sentiment.

// Keywords that signal market-moving news regardless of category — macro
// events, political speeches, central banks, wars/geopolitics, big money
// moves.
const HIGH_IMPACT_KEYWORDS = [
  // Macro / central banks
  "federal reserve", "fed ", "fomc", "interest rate", "rate cut", "rate hike",
  "powell", "ecb", "bank of england", "boe ", "central bank", "inflation",
  "cpi", "jobs report", "unemployment", "gdp", "recession", "stimulus",
  "tariff", "trade war", "sanction", "debt ceiling", "government shutdown",
  "credit rating",

  // Geopolitics / speeches that move markets
  "trump", "biden", "white house", "president", "putin", "xi jinping",
  "zelensky", "netanyahu", "ceasefire", "war", "invasion", "missile",
  "airstrike", "conflict", "election", "opec", "g7", "g20", "summit",
  "treasury secretary", "geopolitic",

  // Big money / market structure
  "wall street", "market crash", "market rally", "sell-off", "selloff",
  "black monday", "circuit breaker", "hedge fund", "blackrock", "vanguard",
  "sovereign wealth", "imf", "world bank",
];

const CATEGORY_KEYWORDS = {
  "₿ Crypto": [
    "bitcoin", "btc", "ethereum", "satoshi", "saylor",
    "microstrategy", "strategy inc", "etf", "sec ", "cftc", "binance",
    "coinbase", "whale", "halving", "stablecoin", "tether", "usdc",
    "all-time high", "all time high", "ath ", "liquidation",
    "solana", "xrp", "ripple", "dogecoin", "regulation", "ban ",
    "hack", "exploit", "outflow", "inflow", "institutional",
  ],
  "💱 Forex": [
    "dollar", "usd", "euro", "eur ", "pound", "gbp", "yen", "jpy", "yuan",
    "naira", "ngn", "currency", "forex", "exchange rate", "devalu",
    "central bank", "interest rate", "cbn ", "petrodollar",
  ],
  "📊 Synthetic Indices": [
    "index", "volatility", "vix", "boom", "crash", "synthetic",
    "derivative", "futures",
  ],
  "🛢️ Oil": [
    "opec", "crude", "barrel", "brent", "wti", "oil price", "gas price",
    "energy crisis", "pipeline", "refinery", "output cut", "production cut",
  ],
  "📈 Stocks": [
    "nasdaq", "dow jones", "s&p 500", "s&p500", "earnings", "ipo", "merger",
    "acquisition", "stock market", "shares", "wall street", "guidance",
    "buyback", "nvidia", "apple", "microsoft", "amazon", "tesla", "google",
    "meta ", "berkshire", "warren buffett", "market cap",
  ],
  "🤖 AI": [
    "openai", "chatgpt", "nvidia", "sam altman", "artificial intelligence",
    "ai chip", "ai regulation", "ai bubble", "anthropic", "gemini", "gpt-",
    "data center", "ai investment", "ai funding", "billion", "trillion",
  ],
  "🌍 Global News": HIGH_IMPACT_KEYWORDS, // global news is noisy by default — require a high-impact hit
};

function normalize(text) {
  return text.toLowerCase();
}

function matchesAny(text, keywords) {
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Decide whether an article is worth posting: a global market-moving event
 * (Trump speech, Fed decision, war, big crypto/stock move, etc.) rather than
 * routine coverage.
 */
export function isMarketMoving(article) {
  const text = normalize(`${article.title} ${article.contentSnippet ?? ""}`);

  if (matchesAny(text, HIGH_IMPACT_KEYWORDS)) return true;

  const categoryKeywords = CATEGORY_KEYWORDS[article.source.category];
  if (categoryKeywords && matchesAny(text, categoryKeywords)) return true;

  return false;
}
