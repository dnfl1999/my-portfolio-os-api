export interface NormalizedMarketPrice {
  ticker: string;
  price: number;
  updatedAt: string;
  currency: string;
}

type UpstreamRecord = Record<string, unknown>;

function pickFirstNumber(record: UpstreamRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function pickFirstString(record: UpstreamRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function pickUpdatedAt(record: UpstreamRecord, timestamp: string) {
  const isoString = pickFirstString(record, [
    "updatedAt",
    "lastUpdatedAt",
    "timestamp",
    "time",
    "07. latest trading day",
  ]);

  if (isoString) {
    return isoString.includes("T") ? isoString : `${isoString}T00:00:00.000Z`;
  }

  const epochValue = pickFirstNumber(record, [
    "updatedAtEpoch",
    "updated_at_epoch",
    "regularMarketTime",
  ]);

  if (epochValue) {
    return new Date(epochValue * 1000).toISOString();
  }

  return timestamp;
}

function normalizeRecord(record: UpstreamRecord, timestamp: string): NormalizedMarketPrice | null {
  const ticker = pickFirstString(record, ["ticker", "symbol", "code", "01. symbol"]);
  const price = pickFirstNumber(record, [
    "price",
    "last",
    "close",
    "regularMarketPrice",
    "lastPrice",
    "05. price",
  ]);

  if (!ticker || price === null) {
    return null;
  }

  return {
    ticker: ticker.trim().toUpperCase(),
    price,
    updatedAt: pickUpdatedAt(record, timestamp),
    currency: pickFirstString(record, ["currency"]) ?? "USD",
  };
}

function resolveRecords(payload: unknown): UpstreamRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is UpstreamRecord => Boolean(item) && typeof item === "object",
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  const arrayCandidateKeys = ["prices", "quotes", "data", "results", "items"];

  for (const key of arrayCandidateKeys) {
    if (Array.isArray(objectPayload[key])) {
      return (objectPayload[key] as unknown[]).filter(
        (item): item is UpstreamRecord => Boolean(item) && typeof item === "object",
      );
    }
  }

  if (objectPayload["Global Quote"] && typeof objectPayload["Global Quote"] === "object") {
    return [objectPayload["Global Quote"] as UpstreamRecord];
  }

  return [];
}

export function mapUpstreamPrices(payload: unknown, timestamp = new Date().toISOString()) {
  return resolveRecords(payload)
    .map((record) => normalizeRecord(record, timestamp))
    .filter((item): item is NormalizedMarketPrice => item !== null);
}