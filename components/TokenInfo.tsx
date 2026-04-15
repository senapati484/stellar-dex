'use client';

import React, { useState, useEffect } from 'react';
import { createDexClient } from '../lib/contract-client';
import { stellar } from '../lib/stellar-helper';
import { StatCard, Card } from './ui';

const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID!;
const POOL_ID = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID!;

interface TokenInfoProps {
  publicKey: string;
}

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
}

export const TokenInfo: React.FC<TokenInfoProps> = ({ publicKey }) => {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [svltBalance, setSvltBalance] = useState(0);
  const [xlmBalance, setXlmBalance] = useState('0');
  const [loading, setLoading] = useState(true);

  const dexClient = createDexClient();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [info, svltBal, balances] = await Promise.all([
          dexClient.getTokenInfo(),
          dexClient.getSvltBalance(publicKey),
          stellar.getBalance(publicKey),
        ]);
        setTokenInfo(info);
        setSvltBalance(svltBal);
        setXlmBalance(balances.xlm);
      } catch (err) {
        console.error('Failed to load token info:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [publicKey, dexClient]);

  if (loading) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          <div className="h-10 animate-pulse bg-borderInner rounded-lg w-32" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 animate-pulse bg-borderInner rounded-lg" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary text-white rounded-full font-serif font-bold text-sm flex items-center justify-center">
          SV
        </div>
        <div>
          <span className="font-serif text-xl text-textMain">SVLT Token</span>
          <p className="text-textMuted text-xs">StellarVault Token</p>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Your XLM"
          value={xlmBalance}
          loading={loading}
        />
        <StatCard
          label="Your SVLT"
          value={tokenInfo ? (svltBalance / 10_000_000).toFixed(4) : '0'}
          loading={loading}
        />
        <StatCard
          label="Total Supply"
          value={tokenInfo ? (tokenInfo.totalSupply / 10_000_000).toLocaleString() : '0'}
          loading={loading}
        />
        <StatCard
          label="Decimals"
          value={tokenInfo ? tokenInfo.decimals.toString() : '7'}
          loading={loading}
        />
      </div>

      {/* Explorer links */}
      <div className="space-y-2 mb-6">
        <a
          href={stellar.getExplorerLink(TOKEN_ID, 'contract')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent text-xs hover:text-textMain inline-flex items-center gap-1"
        >
          View Token Contract →
        </a>
        <br />
        <a
          href={stellar.getExplorerLink(POOL_ID, 'contract')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent text-xs hover:text-textMain inline-flex items-center gap-1"
        >
          View Pool Contract →
        </a>
      </div>

      {/* Info box */}
      <div className="bg-[#F4F2EC] border border-[#E9E7E0] rounded-lg p-3">
        <p className="text-xs text-textMain">
          SVLT is a testnet token. It has no real value.
        </p>
      </div>
    </Card>
  );
};
