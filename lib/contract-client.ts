import { SorobanRpc, xdr, TransactionBuilder, Networks, Address, Contract, ScInt, ScVal } from '@stellar/stellar-sdk';

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
  private server: SorobanRpc.Server;
  private onProgress?: (p: TxProgress) => void;
  private poolInfoCache: { data: any; timestamp: number } | null = null;
  private readonly CACHE_TTL = 10000; // 10 seconds

  constructor(onProgress?: (p: TxProgress) => void) {
    this.server = new SorobanRpc.Server('https://soroban-testnet.stellar.org', {
      allowHttp: true,
    });
    this.onProgress = onProgress;
  }

  private async submitTx(xdr: string): Promise<string> {
    this.onProgress?.({ stage: 'submitting', message: 'Broadcasting to network…' });

    try {
      const txResult = await this.server.sendTransaction(xdr);
      const txHash = txResult.hash;

      this.onProgress?.({ stage: 'confirming', message: 'Confirming on-chain…' });

      // Poll for confirmation, max 30 seconds
      const startTime = Date.now();
      while (Date.now() - startTime < 30000) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const txStatus = await this.server.getTransaction(txHash);

        if (txStatus.status === 'success') {
          this.onProgress?.({ stage: 'success', message: 'Confirmed!', hash: txHash });
          return txHash;
        }

        if (txStatus.status === 'error') {
          throw new ContractError(txStatus.resultXdr || 'Transaction failed');
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
    const method = contract.call('name', 'symbol', 'decimals', 'total_supply');

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get token info');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    const vals = scv.vec()!;

    return {
      name: vals[0].str()!.toString(),
      symbol: vals[1].str()!.toString(),
      decimals: vals[2].u32()!,
      totalSupply: Number(vals[3].u128()!.toString()),
    };
  }

  async getSvltBalance(address: string): Promise<number> {
    const contract = new Contract(TOKEN_ID);
    const addr = new Address(address);
    const method = contract.call('balance', addr.toScVal());

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get balance');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    return Number(scv.u128()!.toString());
  }

  async approveSvlt(ownerKey: string, spenderAddress: string, amount: number): Promise<string> {
    this.onProgress?.({ stage: 'building', message: 'Building transaction…' });

    const contract = new Contract(TOKEN_ID);
    const owner = new Address(ownerKey);
    const spender = new Address(spenderAddress);
    const amountScv = ScVal.scvU128(BigInt(amount));

    const method = contract.call('approve', owner.toScVal(), spender.toScVal(), amountScv);

    const account = await this.server.getAccount(ownerKey);
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(method)
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
    const method = contract.call('get_reserves', 'total_supply', 'fee_bps');

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get pool info');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    const vals = scv.vec()!;

    const reserves = vals[0].vec()!;
    const data = {
      xlmReserve: Number(reserves[0].u128()!.toString()),
      tokenReserve: Number(reserves[1].u128()!.toString()),
      totalLp: Number(vals[1].u128()!.toString()),
      feeBps: vals[2].u32()!,
      cached: false,
    };

    this.poolInfoCache = { data, timestamp: now };
    return data;
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
    const amountInScv = ScVal.scvU128(BigInt(xlmInStroops));
    const minOutScv = ScVal.scvU128(BigInt(Math.floor(quote.amountOut * 0.95))); // 5% slippage tolerance

    const method = contract.call('swap', buyer.toScVal(), amountInScv, minOutScv);

    const account = await this.server.getAccount(buyerKey);
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(method)
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
    const amountInScv = ScVal.scvU128(BigInt(tokenInStroops));
    const minOutScv = ScVal.scvU128(BigInt(Math.floor(quote.amountOut * 0.95))); // 5% slippage tolerance

    const method = contract.call('swap', seller.toScVal(), amountInScv, minOutScv);

    const account = await this.server.getAccount(sellerKey);
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(method)
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
    const xlmScv = ScVal.scvU128(BigInt(xlmAmount));
    const tokenScv = ScVal.scvU128(BigInt(tokenAmount));

    const method = contract.call('add_liquidity', provider.toScVal(), xlmScv, tokenScv);

    const account = await this.server.getAccount(providerKey);
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(method)
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
    const lpScv = ScVal.scvU128(BigInt(lpAmount));

    const method = contract.call('remove_liquidity', provider.toScVal(), lpScv);

    const account = await this.server.getAccount(providerKey);
    const tx = new TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(method)
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
    const method = contract.call('balance', addr.toScVal());

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get LP balance');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    return Number(scv.u128()!.toString());
  }

  // ==================== REGISTRY METHODS ====================

  async getPools(): Promise<PoolInfo[]> {
    const contract = new Contract(REGISTRY_ID);
    const method = contract.call('get_pools');

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get pools');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    const poolVec = scv.vec()!;

    return poolVec.map(pool => {
      const fields = pool.obj()!;
      return {
        poolId: fields.get('pool_id')!.address()!.toString(),
        tokenA: fields.get('token_a')!.str()!.toString(),
        tokenB: fields.get('token_b')!.str()!.toString(),
        tokenContract: fields.get('token_contract')!.address()!.toString(),
        createdAt: Number(fields.get('created_at')!.u64()!.toString()),
      };
    });
  }

  async getPoolCount(): Promise<number> {
    const contract = new Contract(REGISTRY_ID);
    const method = contract.call('pool_count');

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get pool count');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    return scv.u32()!;
  }

  async getTotalLiquidity(): Promise<number> {
    const contract = new Contract(REGISTRY_ID);
    const method = contract.call('get_total_liquidity');

    const result = await this.server.simulateTransaction(
      new TransactionBuilder(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH', '0'), {
        fee: 100,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(method)
        .build()
    );

    if (result.status !== 'success') {
      throw new ContractError('Failed to get total liquidity');
    }

    const xdrResult = result.result?.toXDR('base64');
    const scv = xdr.ScVal.fromXDR(xdrResult!, 'base64');
    return Number(scv.u128()!.toString());
  }
}

export function createDexClient(onProgress?: (p: TxProgress) => void) {
  return new DexContractClient(onProgress);
}
