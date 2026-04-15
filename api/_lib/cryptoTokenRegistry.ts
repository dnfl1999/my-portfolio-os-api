export interface CryptoTokenConfig {
  ticker: string;
  network: string;
  address: string;
}

const cryptoTokens: CryptoTokenConfig[] = [
  {
    ticker: "BNKR",
    network: "base",
    address: "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b",
  },
];

const cryptoTokenMap = new Map(
  cryptoTokens.map((token) => [token.ticker.toUpperCase(), token] as const),
);

export function getCryptoTokenConfig(ticker: string) {
  return cryptoTokenMap.get(ticker.trim().toUpperCase()) ?? null;
}
