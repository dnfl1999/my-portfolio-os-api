import { mapUpstreamPrices, NormalizedMarketPrice } from "./_lib/marketDataMapper.js";

type PriceApiRequest = {
  tickers?: string[];
};

const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Content-Type";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_UPSTREAM_TICKERS_PER_REQUEST = 8;

type PriceApiWarning = {
  ticker: string;
  message: string;
};

const priceCache = new Map<
  string,
  {
    expiresAt: number;
    price: NormalizedMarketPrice;
  }
>();

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = process.env.MARKET_DATA_ALLOWED_ORIGIN?.trim() || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin === "*" ? "*" : origin ?? allowedOrigin,
    "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    Vary: "Origin",
  };
}

function normalizeTickers(body: PriceApiRequest) {
  return Array.from(
    new Set(
      (body.tickers ?? [])
        .filter((ticker): ticker is string => typeof ticker === "string")
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function createTwelveDataUrl(ticker: string) {
  const upstreamBaseUrl = process.env.PRICE_UPSTREAM_URL?.trim();
  const apiKey = process.env.PRICE_API_KEY?.trim();

  if (!upstreamBaseUrl) {
    throw new Error("PRICE_UPSTREAM_URL is not set.");
  }

  if (!apiKey) {
    throw new Error("PRICE_API_KEY is not set.");
  }

  const url = new URL(upstreamBaseUrl);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);

  return url;
}

function getCacheTtlMs() {
  const value = Number(process.env.PRICE_CACHE_TTL_SECONDS);

  if (Number.isFinite(value) && value > 0) {
    return value * 1000;
  }

  return DEFAULT_CACHE_TTL_MS;
}

function getMaxUpstreamTickersPerRequest() {
  const value = Number(process.env.PRICE_MAX_UPSTREAM_TICKERS_PER_REQUEST);

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return DEFAULT_MAX_UPSTREAM_TICKERS_PER_REQUEST;
}

function getCachedPrice(ticker: string) {
  const cached = priceCache.get(ticker);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    priceCache.delete(ticker);
    return null;
  }

  return cached.price;
}

function setCachedPrice(ticker: string, price: NormalizedMarketPrice) {
  priceCache.set(ticker, {
    expiresAt: Date.now() + getCacheTtlMs(),
    price,
  });
}

function exampleResponse(tickers: string[]) {
  const timestamp = new Date().toISOString();
  const samplePrices = {
    TLRY: 1.82,
    PFE: 27.46,
    NVTS: 3.11,
  } as const;

  return {
    prices: tickers
      .filter((ticker) => ticker in samplePrices)
      .map((ticker) => ({
        ticker,
        price: samplePrices[ticker as keyof typeof samplePrices],
        updatedAt: timestamp,
        currency: "USD",
      })),
  };
}

async function fetchTwelveDataPrice(ticker: string) {
  const response = await fetch(createTwelveDataUrl(ticker));

  if (!response.ok) {
    throw new Error(`Twelve Data request failed for ${ticker}. (${response.status})`);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  if (payload.status === "error") {
    throw new Error(String(payload.message ?? `No quote returned for ${ticker}.`));
  }

  const mapped = mapUpstreamPrices({ ...payload, ticker });

  if (mapped.length === 0) {
    throw new Error(`No quote returned for ${ticker}. Response: ${JSON.stringify(payload)}`);
  }

  const price = mapped[0];
  setCachedPrice(ticker, price);

  return price;
}

async function fetchTwelveDataPrices(tickers: string[]) {
  const prices = [];
  const warnings: PriceApiWarning[] = [];
  const maxUpstreamTickers = getMaxUpstreamTickersPerRequest();
  let upstreamRequestCount = 0;

  for (const ticker of tickers) {
    const cached = getCachedPrice(ticker);

    if (cached) {
      prices.push(cached);
      continue;
    }

    if (upstreamRequestCount >= maxUpstreamTickers) {
      warnings.push({
        ticker,
        message: `Skipped ${ticker} because the per-request upstream limit is ${maxUpstreamTickers}.`,
      });
      continue;
    }

    upstreamRequestCount += 1;

    try {
      prices.push(await fetchTwelveDataPrice(ticker));
    } catch (error) {
      warnings.push({
        ticker,
        message:
          error instanceof Error
            ? error.message
            : `Unknown error while loading ${ticker}.`,
      });
    }
  }

  return { prices, warnings };
}

async function handleRequest(request: Request) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return json({ message: "Method Not Allowed" }, 405, corsHeaders);
  }

  let body: PriceApiRequest;

  try {
    body = (await request.json()) as PriceApiRequest;
  } catch {
    return json({ message: "Failed to parse JSON body." }, 400, corsHeaders);
  }

  const tickers = normalizeTickers(body);

  if (tickers.length === 0) {
    return json({ message: "tickers array is required." }, 400, corsHeaders);
  }

  if (process.env.PRICE_PROVIDER_MODE?.trim() === "example") {
    return json(exampleResponse(tickers), 200, corsHeaders);
  }

  try {
    const result = await fetchTwelveDataPrices(tickers);

    if (result.prices.length === 0) {
      return json(
        {
          message: result.warnings[0]?.message ?? "No quotes returned.",
          prices: [],
          warnings: result.warnings,
        },
        502,
        corsHeaders,
      );
    }

    return json(result, 200, corsHeaders);
  } catch (error) {
    return json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unknown error while loading market data.",
      },
      500,
      corsHeaders,
    );
  }
}

export function OPTIONS(request: Request) {
  return handleRequest(request);
}

export function POST(request: Request) {
  return handleRequest(request);
}

export function GET(request: Request) {
  return handleRequest(request);
}
