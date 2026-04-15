import {
  rpc,
  xdr,
  TransactionBuilder,
  Networks,
  Address,
  Contract,
  Account,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';

const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID!;
const POOL_ID = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID!;
const REGISTRY_ID = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID!;

export type TxProgress =
  | { stage: 'idle' }
  | { stage: 'building'; message: 'Building transaction…' }
  | { stage: 'signing'; message: 'Waiting for wallet…' }
  | { stage: 'submitting'; message: 'Broadcasting to network…' }
  | { stage: 'confirming'; message: 'Confirming on-chain…' }
  | { stage: 'success'; message: 'Confirmed!'; hash: string }
  | { stage: 'error'; message: string; errorType: string };

export interface PoolInfo {
  poolId: string;
  tokenA: string;
  tokenB: string;
  tokenContract: string;
  createdAt: number;
}

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

export class SlippageExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlippageExceededError';
  }
}

class DexContractClient {
  private server: rpc.Server;
  private onProgress?: (p: TxProgress) => void;
  private poolInfoCache: { data: any; timestamp: number } | null = null;
  private readonly CACHE_TTL = 10000; // 10 seconds

  constructor(onProgress?: (p: TxProgress) => void) {
    this.server = new rpc.Server('https://soroban-testnet.stellar.org', {
      allowHttp: true,
    });
    this.onProgress = onProgress;
  }

  private async submitTx(tx: string): Promise<string> {
    this.onProgress?.({ stage: 'submitting', message: 'Broadcasting to network…' });

    try {
      const txResult = await this.server.sendTransaction(
        TransactionBuilder.fromXDR(tx, Networks.TESTNET)
      );
      const txHash = txResult.hash;

      this.onProgress?.({ stage: 'confirming', message: 'Confirming on-chain…' });

      // Poll for confirmation, max 30 seconds
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const txStatus = await this.server.getTransaction(txHash);

        if (txStatus.status === 'SUCCESS') {
          this.onProgress?.({ stage: 'success', message: 'Confirmed!', hash: txHash });
          return txHash;
        }

        if (txStatus.status === 'FAILED') {
          throw new ContractError('Transaction failed');
        }
      }

      throw new ContractError('Transaction confirmation timeout');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.onProgress?.({ stage: 'error', message: errorMessage, errorType: 'TransactionError' });
      throw new ContractError(errorMessage);
    }
  }

  // ==================== TOKEN METHODS ====================

  async getTokenInfo(): Promise<{ name: string; symbol: string; decimals: number; totalSupply: number }> {
    const contract = new Contract(TOKEN_ID);
    const scValName = nativeToScVal('name', { type: 'string' });
    const scValSymbol = nativeToScVal('symbol', { type: 'string' });
    const scValDecimals = nativeToScVal('decimals', { type: 'string' });
    const scValTotalSupply = nativeToScVal('total_supply', { type: 'string' });

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('name', scValName, scValSymbol, scValDecimals, scValTotalSupply))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get token info');
    }

    if (result.result?.retval) {
      const vals = scValToNative(result.result.retval) as any[];
      return {
        name: vals[0],
        symbol: vals[1],
        decimals: vals[2],
        totalSupply: vals[3],
      };
    }

    throw new ContractError('No token info returned');
  }

  async getSvltBalance(address: string): Promise<number> {
    const contract = new Contract(TOKEN_ID);
    const addr = new Address(address);
    const scValAddr = nativeToScVal(addr, { type: 'address' });

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('balance', scValAddr))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get balance');
    }

    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }

    throw new ContractError('No balance returned');
  }

  async approveSvlt(ownerKey: string, spenderAddress: string, amount: number): Promise<string> {
    this.onProgress?.({ stage: 'building', message: 'Building transaction…' });

    const contract = new Contract(TOKEN_ID);
    const owner = new Address(ownerKey);
    const spender = new Address(spenderAddress);
    const scValOwner = nativeToScVal(owner, { type: 'address' });
    const scValSpender = nativeToScVal(spender, { type: 'address' });
    const scValAmount = nativeToScVal(BigInt(amount), { type: 'u128' });

    const account = await this.server.getAccount(ownerKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('approve', scValOwner, scValSpender, scValAmount))
      .setTimeout(30)
      .build();

    const preparedTx = await this.server.prepareTransaction(tx);
    const xdrTx = preparedTx.toXDR();

    this.onProgress?.({ stage: 'signing', message: 'Waiting for wallet…' });

    // In a real implementation, this would be signed by the wallet
    // For now, we'll assume the signed XDR is returned
    const signedXdr = xdrTx; // Placeholder - would be signed by wallet

    return this.submitTx(signedXdr);
  }

  // ==================== POOL METHODS ====================

  async getPoolInfo(): Promise<{
    xlmReserve: number;
    tokenReserve: number;
    totalLp: number;
    feeBps: number;
    cached: boolean;
  }> {
    const now = Date.now();
    if (this.poolInfoCache && now - this.poolInfoCache.timestamp < this.CACHE_TTL) {
      return { ...this.poolInfoCache.data, cached: true };
    }

    const contract = new Contract(POOL_ID);

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('get_pool_info'))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get pool info');
    }

    if (result.result?.retval) {
      const poolInfo = scValToNative(result.result.retval) as any;
      const data = {
        xlmReserve: Number(poolInfo.xlmReserve || poolInfo.xlm_reserve || 0),
        tokenReserve: Number(poolInfo.tokenReserve || poolInfo.token_reserve || 0),
        totalLp: Number(poolInfo.totalLp || poolInfo.total_lp || 0),
        feeBps: Number(poolInfo.feeBps || poolInfo.fee_bps || 0),
        cached: false,
      };

      this.poolInfoCache = { data, timestamp: now };
      return data;
    }

    throw new ContractError('No pool info returned');
  }

  async getQuote(direction: 'xlm_to_token' | 'token_to_xlm', amountIn: number): Promise<{
    amountOut: number;
    priceImpact: number;
    fee: number;
  }> {
    const { xlmReserve, tokenReserve, feeBps } = await this.getPoolInfo();
    const feeMultiplier = 1 - feeBps / 10000;

    let amountOut: number;
    let priceImpact: number;

    if (direction === 'xlm_to_token') {
      amountOut = Math.floor((amountIn * tokenReserve * feeMultiplier) / (xlmReserve + amountIn));
      priceImpact = Math.abs((amountIn / xlmReserve) * 100);
    } else {
      amountOut = Math.floor((amountIn * xlmReserve * feeMultiplier) / (tokenReserve + amountIn));
      priceImpact = Math.abs((amountIn / tokenReserve) * 100);
    }

    const fee = Math.floor(amountIn * (feeBps / 10000));

    return { amountOut, priceImpact, fee };
  }

  async swapXlmForToken(buyerKey: string, xlmInStroops: number): Promise<string> {
    const quote = await this.getQuote('xlm_to_token', xlmInStroops);

    if (quote.priceImpact > 5) {
      throw new SlippageExceededError(`Price impact ${quote.priceImpact.toFixed(2)}% exceeds 5%`);
    }

    this.onProgress?.({ stage: 'building', message: 'Building transaction…' });

    const contract = new Contract(POOL_ID);
    const buyer = new Address(buyerKey);
    const scValBuyer = nativeToScVal(buyer, { type: 'address' });
    const scValAmountIn = nativeToScVal(BigInt(xlmInStroops), { type: 'u128' });
    const scValMinOut = nativeToScVal(BigInt(Math.floor(quote.amountOut * 0.95)), { type: 'u128' }); // 5% slippage

    const account = await this.server.getAccount(buyerKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('swap', scValBuyer, scValAmountIn, scValMinOut))
      .setTimeout(30)
      .build();

    const preparedTx = await this.server.prepareTransaction(tx);
    const xdrTx = preparedTx.toXDR();

    this.onProgress?.({ stage: 'signing', message: 'Waiting for wallet…' });

    const signedXdr = xdrTx; // Placeholder - would be signed by wallet

    return this.submitTx(signedXdr);
  }

  async swapTokenForXlm(sellerKey: string, tokenInStroops: number): Promise<string> {
    const quote = await this.getQuote('token_to_xlm', tokenInStroops);

    if (quote.priceImpact > 5) {
      throw new SlippageExceededError(`Price impact ${quote.priceImpact.toFixed(2)}% exceeds 5%`);
    }

    this.onProgress?.({ stage: 'building', message: 'Building transaction…' });

    const contract = new Contract(POOL_ID);
    const seller = new Address(sellerKey);
    const scValSeller = nativeToScVal(seller, { type: 'address' });
    const scValAmountIn = nativeToScVal(BigInt(tokenInStroops), { type: 'u128' });
    const scValMinOut = nativeToScVal(BigInt(Math.floor(quote.amountOut * 0.95)), { type: 'u128' }); // 5% slippage

    const account = await this.server.getAccount(sellerKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('swap', scValSeller, scValAmountIn, scValMinOut))
      .setTimeout(30)
      .build();

    const preparedTx = await this.server.prepareTransaction(tx);
    const xdrTx = preparedTx.toXDR();

    this.onProgress?.({ stage: 'signing', message: 'Waiting for wallet…' });

    const signedXdr = xdrTx; // Placeholder - would be signed by wallet

    return this.submitTx(signedXdr);
  }

  async addLiquidity(providerKey: string, xlmAmount: number, tokenAmount: number): Promise<string> {
    // First approve token spending
    await this.approveSvlt(providerKey, POOL_ID, tokenAmount);

    this.onProgress?.({ stage: 'building', message: 'Building transaction…' });

    const contract = new Contract(POOL_ID);
    const provider = new Address(providerKey);
    const scValProvider = nativeToScVal(provider, { type: 'address' });
    const scValXlm = nativeToScVal(BigInt(xlmAmount), { type: 'u128' });
    const scValToken = nativeToScVal(BigInt(tokenAmount), { type: 'u128' });

    const account = await this.server.getAccount(providerKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('add_liquidity', scValProvider, scValXlm, scValToken))
      .setTimeout(30)
      .build();

    const preparedTx = await this.server.prepareTransaction(tx);
    const xdrTx = preparedTx.toXDR();

    this.onProgress?.({ stage: 'signing', message: 'Waiting for wallet…' });

    const signedXdr = xdrTx; // Placeholder - would be signed by wallet

    return this.submitTx(signedXdr);
  }

  async removeLiquidity(providerKey: string, lpAmount: number): Promise<string> {
    this.onProgress?.({ stage: 'building', message: 'Building transaction…' });

    const contract = new Contract(POOL_ID);
    const provider = new Address(providerKey);
    const scValProvider = nativeToScVal(provider, { type: 'address' });
    const scValLp = nativeToScVal(BigInt(lpAmount), { type: 'u128' });

    const account = await this.server.getAccount(providerKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('remove_liquidity', scValProvider, scValLp))
      .setTimeout(30)
      .build();

    const preparedTx = await this.server.prepareTransaction(tx);
    const xdrTx = preparedTx.toXDR();

    this.onProgress?.({ stage: 'signing', message: 'Waiting for wallet…' });

    const signedXdr = xdrTx; // Placeholder - would be signed by wallet

    return this.submitTx(signedXdr);
  }

  async getLpBalance(address: string): Promise<number> {
    const contract = new Contract(POOL_ID);
    const addr = new Address(address);
    const scValAddr = nativeToScVal(addr, { type: 'address' });

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('balance', scValAddr))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get LP balance');
    }

    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }

    throw new ContractError('No LP balance returned');
  }

  // ==================== REGISTRY METHODS ====================

  async getPools(): Promise<PoolInfo[]> {
    const contract = new Contract(REGISTRY_ID);

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('get_pools'))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get pools');
    }

    if (result.result?.retval) {
      const pools = scValToNative(result.result.retval) as any[];
      return pools.map(pool => ({
        poolId: pool.poolId || pool.pool_id || '',
        tokenA: pool.tokenA || pool.token_a || '',
        tokenB: pool.tokenB || pool.token_b || '',
        tokenContract: pool.tokenContract || pool.token_contract || '',
        createdAt: Number(pool.createdAt || pool.created_at || 0),
      }));
    }

    throw new ContractError('No pools returned');
  }

  async getPoolCount(): Promise<number> {
    const contract = new Contract(REGISTRY_ID);

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('pool_count'))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get pool count');
    }

    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }

    throw new ContractError('No pool count returned');
  }

  async getTotalLiquidity(): Promise<number> {
    const contract = new Contract(REGISTRY_ID);

    const fakeAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0');
    const tx = new TransactionBuilder(fakeAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call('get_total_liquidity'))
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);

    if ('error' in result) {
      throw new ContractError('Failed to get total liquidity');
    }

    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }

    throw new ContractError('No total liquidity returned');
  }
}

export function createDexClient(onProgress?: (p: TxProgress) => void) {
  return new DexContractClient(onProgress);
}
