import { vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@/lib/stellar-helper', () => ({
  stellar: {
    connectWallet: vi.fn().mockResolvedValue('GTEST...1234'),
    disconnect: vi.fn(),
    getBalance: vi.fn().mockResolvedValue({ xlm: '100', cached: false }),
    getExplorerLink: vi.fn((h: string, t: string) => `https://stellar.expert/testnet/${t}/${h}`),
    formatAddress: vi.fn((a: string) => a.slice(0, 4) + '...' + a.slice(-4)),
    formatXLM: vi.fn((s: number) => (s / 10_000_000).toFixed(2)),
  },
  WalletNotFoundError: class extends Error {
    name = 'WalletNotFoundError';
  },
  WalletRejectedError: class extends Error {
    name = 'WalletRejectedError';
  },
  InsufficientBalanceError: class extends Error {
    name = 'InsufficientBalanceError';
  },
  SlippageExceededError: class extends Error {
    name = 'SlippageExceededError';
  },
  ContractError: class extends Error {
    name = 'ContractError';
  },
}));

vi.mock('@/lib/contract-client', () => ({
  createDexClient: vi.fn(() => ({
    getPoolInfo: vi.fn().mockResolvedValue({
      xlmReserve: 1e9,
      tokenReserve: 1e12,
      totalLp: 1e9,
      feeBps: 30,
      cached: false,
    }),
    getQuote: vi.fn().mockResolvedValue({
      amountOut: 9850000,
      priceImpact: 0.15,
      fee: 300,
    }),
    swapXlmForToken: vi.fn().mockResolvedValue('txhash123'),
    getSvltBalance: vi.fn().mockResolvedValue(1000000000),
    getTokenInfo: vi.fn().mockResolvedValue({
      name: 'StellarVault Token',
      symbol: 'SVLT',
      decimals: 7,
      totalSupply: 1e13,
    }),
    getLpBalance: vi.fn().mockResolvedValue(0),
  })),
}));
