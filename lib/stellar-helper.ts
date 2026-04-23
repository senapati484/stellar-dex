import {
  Horizon,
  Networks,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Asset,
  Memo,
  Transaction,
  Account,
  rpc,
  nativeToScVal,
  Address,
  scValToNative,
} from "@stellar/stellar-sdk";
import { StellarWalletsKit, ModuleType } from "@creit.tech/stellar-wallets-kit";

/* ═══════════════════════════════════════════════
   TYPED ERROR CLASSES
   ═══════════════════════════════════════════════ */

export class WalletNotFoundError extends Error {
  name = "WalletNotFoundError";
}
export class WalletRejectedError extends Error {
  name = "WalletRejectedError";
}
export class InsufficientBalanceError extends Error {
  name = "InsufficientBalanceError";
}
export class DestinationUnfundedError extends Error {
  name = "DestinationUnfundedError";
}
export class SlippageExceededError extends Error {
  name = "SlippageExceededError";
}
export class ContractError extends Error {
  name = "ContractError";
}

/* ═══════════════════════════════════════════════
   TTL CACHE
   ═══════════════════════════════════════════════ */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(private defaultTtlMs: number, maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
  }
}

/* ═══════════════════════════════════════════════
   TX TYPE
   ═══════════════════════════════════════════════ */

interface Tx {
  hash: string;
  source: string;
  destination?: string;
  amount: string;
  asset: string;
  memo?: string;
  ledger: number;
  createdAt: string;
  feeCharged: string;
  success: boolean;
}

type BalanceResult = { xlm: string; svlt?: string; cached: boolean };
type TxResult = { transactions: Tx[]; cached: boolean };
type PoolResult = {
  xlmReserve: string;
  tokenReserve: string;
  totalLp: string;
  feeBps: number;
  cached: boolean;
};

/* ═══════════════════════════════════════════════
   StellarHelper CLASS
   ═══════════════════════════════════════════════ */

let walletKitInitialized = false;

export class StellarHelper {
  public readonly horizon: Horizon.Server;
  public readonly rpcServer: rpc.Server;
  public readonly networkPassphrase: Networks;

  private balanceCache = new TTLCache(30_000);
  private txCache = new TTLCache(20_000);
  private poolCache = new TTLCache(10_000);

  constructor(network: "testnet" | "mainnet" = "testnet") {
    const isTestnet = network === "testnet";
    this.networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

    this.horizon = new Horizon.Server(
      isTestnet ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org"
    );
    this.rpcServer = new rpc.Server(
      isTestnet ? "https://soroban-testnet.stellar.org" : "https://soroban-mainnet.stellar.org"
    );

    if (typeof window !== "undefined" && !walletKitInitialized) {
      StellarWalletsKit.init({
        network: this.networkPassphrase,
        selectedWalletId: "freighter",
        modules: [],
      });
      walletKitInitialized = true;
    }
  }

  /* ─── Wallet ─── */

  async connectWallet(): Promise<string> {
    try {
      const result = await StellarWalletsKit.getAddress();
      return result.address;
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "";
      if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("cancel")) {
        throw new WalletRejectedError("Wallet connection was rejected");
      }
      throw new WalletNotFoundError("No wallet found. Install Freighter at https://freighter.app");
    }
  }

  disconnect(): void {
    this.balanceCache.invalidateAll();
    this.txCache.invalidateAll();
    this.poolCache.invalidateAll();
    StellarWalletsKit.disconnect();
  }

  /* ─── Balance ─── */

  async getBalance(publicKey: string, forceRefresh = false): Promise<BalanceResult> {
    const cacheKey = `balance:${publicKey}`;

    if (!forceRefresh) {
      const cached = this.balanceCache.get(cacheKey);
      if (cached) return { ...(cached as BalanceResult), cached: true };
    }

    const account = await this.horizon.accounts().accountId(publicKey).call();
    const nativeBal = account.balances.find((b) => b.asset_type === "native");
    const xlm = nativeBal ? nativeBal.balance : "0";

    // SVLT balance via Soroban RPC
    const tokenContractId = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID;
    let svlt: string | undefined;
    if (tokenContractId) {
      try {
        svlt = await this._callTokenBalance(tokenContractId, publicKey);
      } catch {
        svlt = undefined;
      }
    }

    const result: BalanceResult = { xlm, svlt, cached: false };
    this.balanceCache.set(cacheKey, result);
    return result;
  }

  private async _callTokenBalance(contractId: string, address: string): Promise<string> {
    const contract = new Contract(contractId);
    const scValAddress = nativeToScVal(new Address(address), { type: "address" });

    // Build a minimal Soroban transaction for simulation
    const fakeAccount = new Account(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      "0"
    );
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call("balance", scValAddress))
      .setTimeout(30)
      .build();

    const simulation = await this.rpcServer.simulateTransaction(tx);
    if (!("error" in simulation) && simulation.result?.retval) {
      const val = scValToNative(simulation.result.retval);
      return String(val);
    }
    throw new Error("No balance returned");
  }

  /* ─── Payment ─── */

  async sendPayment(params: {
    from: string;
    to: string;
    amount: string;
    memo?: string;
  }): Promise<{ hash: string; success: boolean }> {
    const { from, to, amount, memo } = params;

    // Check destination account exists
    try {
      await this.horizon.accounts().accountId(to).call();
    } catch (err: unknown) {
      const is404 =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        (err as any).response &&
        typeof (err as any).response === "object" &&
        "status" in (err as any).response &&
        ((err as any).response as { status: number }).status === 404;
      if (is404) {
        throw new DestinationUnfundedError(`Destination account ${to} is not funded`);
      }
      throw err;
    }

    const sourceRecord = await this.horizon.accounts().accountId(from).call();
    const account = new Account(sourceRecord.id, sourceRecord.sequence);

    let txBuilder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: to,
          asset: Asset.native(),
          amount,
        })
      )
      .setTimeout(180);

    if (memo) {
      txBuilder = txBuilder.addMemo(Memo.text(memo));
    }

    const tx = txBuilder.build();

    // Sign with connected wallet
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx.toXDR(), {
      networkPassphrase: this.networkPassphrase,
    });

    const signedTx = TransactionBuilder.fromXDR(signedTxXdr, this.networkPassphrase) as Transaction;
    const response = await this.horizon.submitTransaction(signedTx);

    if (response.successful) {
      this.balanceCache.invalidate(`balance:${from}`);
      this.balanceCache.invalidate(`balance:${to}`);
      this.txCache.invalidate(`txs:${from}`);
    }

    return { hash: response.hash, success: response.successful };
  }

  /* ─── Recent Transactions ─── */

  async getRecentTransactions(
    publicKey: string,
    limit = 10,
    forceRefresh = false
  ): Promise<TxResult> {
    const cacheKey = `txs:${publicKey}`;

    if (!forceRefresh) {
      const cached = this.txCache.get(cacheKey);
      if (cached) return { ...(cached as TxResult), cached: true };
    }

    const records = (
      await this.horizon
        .transactions()
        .forAccount(publicKey)
        .order("desc")
        .limit(limit)
        .call()
    ).records;

    const transactions: Tx[] = records.map((tx) => ({
      hash: tx.hash,
      source: tx.source_account,
      ledger: tx.ledger_attr as number,
      createdAt: tx.created_at,
      feeCharged: String(tx.fee_charged),
      success: tx.successful,
      memo: "",
      amount: "",
      asset: "XLM",
      destination: undefined,
    }));

    const result: TxResult = { transactions, cached: false };
    this.txCache.set(cacheKey, result);
    return result;
  }

  /* ─── Pool Data ─── */

  async getPoolInfo(forceRefresh = false): Promise<PoolResult | null> {
    const cacheKey = "pool:info";

    if (!forceRefresh) {
      const cached = this.poolCache.get(cacheKey);
      if (cached) return { ...(cached as PoolResult), cached: true };
    }

    const poolId = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID;
    if (!poolId) return null;

    try {
      const contract = new Contract(poolId);
      const fakeAccount = new Account(
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        "0"
      );
      const tx = new TransactionBuilder(fakeAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call("get_pool_info"))
        .setTimeout(30)
        .build();
      const simulation = await this.rpcServer.simulateTransaction(tx);

      if ("result" in simulation && simulation.result?.retval) {
        const d = scValToNative(simulation.result.retval);
        const result: PoolResult = {
          xlmReserve: String(d?.xlm_reserve ?? d?.[0] ?? "0"),
          tokenReserve: String(d?.token_reserve ?? d?.[1] ?? "0"),
          totalLp: String(d?.total_lp ?? d?.[2] ?? "0"),
          feeBps: Number(d?.fee_bps ?? d?.[3] ?? 0),
          cached: false,
        };
        this.poolCache.set(cacheKey, result);
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  /* ─── Utilities ─── */

  getExplorerLink(hash: string, type: "tx" | "account" | "contract"): string {
    const sub = this.networkPassphrase === Networks.TESTNET ? "testnet." : "";
    const plural =
      type === "tx" ? "transactions" : type === "account" ? "accounts" : "contract";
    return `https://${sub}stellar.expert/explorer/${plural}/${hash}`;
  }

  formatAddress(address: string, start = 4, end = 4): string {
    if (address.length <= start + end) return address;
    return `${address.slice(0, start)}…${address.slice(-end)}`;
  }

  formatXLM(stroops: number): string {
    return (stroops / 10_000_000).toFixed(2);
  }

  formatSVLT(stroops: number): string {
    return (stroops / 10_000_000).toFixed(4);
  }
}

let stellarInstance: StellarHelper | undefined;

function getStellarHelper(): StellarHelper {
  if (typeof window === 'undefined') {
    // Server-side: create a dummy instance
    return {
      horizon: new Horizon.Server("https://horizon-testnet.stellar.org"),
      rpcServer: new rpc.Server("https://soroban-testnet.stellar.org"),
      networkPassphrase: Networks.TESTNET,
      connectWallet: async () => { throw new Error('Cannot call connectWallet on server'); },
      disconnect: () => {},
      getBalance: async () => ({ xlm: '0', cached: false }),
      getRecentTransactions: async () => ({ transactions: [], cached: false }),
      getPoolInfo: async () => null,
      getExplorerLink: () => '',
      formatAddress: () => '',
      formatXLM: () => '',
    } as any;
  }
  
  if (!stellarInstance) {
    stellarInstance = new StellarHelper("testnet");
  }
  return stellarInstance;
}

let cachedInstance: StellarHelper | undefined;

export const stellar = new Proxy({} as StellarHelper, {
  get: (target, prop) => {
    if (!cachedInstance) {
      cachedInstance = getStellarHelper();
    }
    return (cachedInstance as any)[prop];
  },
});
