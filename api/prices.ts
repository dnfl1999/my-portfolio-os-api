import { mapUpstreamPrices } from "./_lib/marketDataMapper.js";

type PriceApiRequest = {
  tickers?: string[];
};

const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Content-Type";

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

async function fetchTwelveDataPrices(tickers: string[]) {
  const responses = await Promise.all(
    tickers.map(async (ticker) => {
      const response = await fetch(createTwelveDataUrl(ticker));

      if (!response.ok) {
        throw new Error(`Twelve Data request failed for ${ticker}. (${response.status})`);
      }

      const payload = (await response.json()) as Record<string, unknown>;

      if (typeof payload.message === "string") {
        throw new Error(payload.message);
      }

      if (payload.status === "error") {
        throw new Error(
          typeof payload.code === "number"
            ? `Twelve Data error ${payload.code}: ${String(payload.message ?? "unknown error")}`
            : String(payload.message ?? `No quote returned for ${ticker}.`),
        );
      }

      const mapped = mapUpstreamPrices({ ...payload, ticker });

      if (mapped.length === 0) {
        throw new Error(`No quote returned for ${ticker}.`);
      }

      return mapped[0];
    }),
  );

  return responses;
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
    const prices = await fetchTwelveDataPrices(tickers);
    return json({ prices }, 200, corsHeaders);
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