'use client';

import React, { useState } from 'react';
import { stellar, WalletNotFoundError, WalletRejectedError } from '../lib/stellar-helper';
import { Navbar } from '../components/Navbar';
import { TokenInfo } from '../components/TokenInfo';
import { SwapPanel } from '../components/SwapPanel';
import { Alert } from '../components/ui';

export default function Home() {
  const [publicKey, setPublicKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [error, setError] = useState<{ type: 'warning' | 'info'; message: string } | null>(null);

  const handleConnect = async () => {
    try {
      setError(null);
      const address = await stellar.connectWallet();
      setPublicKey(address);
      setIsConnected(true);
    } catch (err) {
      if (err instanceof WalletNotFoundError) {
        setError({ type: 'warning', message: 'No Stellar wallet found. Install Freighter or another wallet.' });
      } else if (err instanceof WalletRejectedError) {
        setError({ type: 'info', message: 'You cancelled the signing. Click to try again.' });
      } else {
        setError({ type: 'warning', message: 'Failed to connect wallet' });
      }
    }
  };

  const handleDisconnect = () => {
    stellar.disconnect();
    setPublicKey('');
    setIsConnected(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        publicKey={publicKey}
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <div className="container mx-auto px-4 py-8">
        {!isConnected ? (
          <>
            {/* Hero */}
            <div className="py-16 sm:py-24 text-center animate-fade-in bg-surface border border-borderInner rounded-2xl shadow-sm mb-8 px-4">
              <h1 className="font-serif text-4xl sm:text-6xl font-medium tracking-tight text-textMain mb-4">
                StellarDEX
              </h1>
              <p className="text-textMuted text-sm sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
                A mini decentralized exchange built on Soroban smart contracts.
              </p>
              <button
                onClick={handleConnect}
                className="claude-button-primary px-6 sm:px-10 py-3 text-sm sm:text-base"
              >
                Connect Wallet
              </button>

              {/* Contract badges */}
              <div className="flex flex-wrap justify-center gap-3 mt-8">
                <span className="text-[10px] font-mono uppercase px-3 py-1.5 rounded-md border border-primary bg-primary/10 text-primary">
                  Token: SVLT
                </span>
                <span className="text-[10px] font-mono uppercase px-3 py-1.5 rounded-md border border-blue-500 bg-blue-500/10 text-blue-500">
                  Pool: XLM/SVLT
                </span>
                <span className="text-[10px] font-mono uppercase px-3 py-1.5 rounded-md border border-green-500 bg-green-500/10 text-green-500">
                  Fee: 0.30%
                </span>
              </div>
            </div>

            {/* Feature grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8 animate-slide-up stagger-2">
              <div className="claude-card p-4">
                <div className="text-2xl mb-2">⚡</div>
                <h3 className="font-serif text-sm text-textMain mb-1">Swap</h3>
                <p className="text-textMuted text-xs">Instant XLM SVLT swaps</p>
              </div>
              <div className="claude-card p-4">
                <div className="text-2xl mb-2">💧</div>
                <h3 className="font-serif text-sm text-textMain mb-1">Liquidity</h3>
                <p className="text-textMuted text-xs">Earn 0.3% fees as LP</p>
              </div>
              <div className="claude-card p-4">
                <div className="text-2xl mb-2">🔗</div>
                <h3 className="font-serif text-sm text-textMain mb-1">On-chain</h3>
                <p className="text-textMuted text-xs">3 Soroban contracts</p>
              </div>
              <div className="claude-card p-4">
                <div className="text-2xl mb-2">📡</div>
                <h3 className="font-serif text-sm text-textMain mb-1">Live</h3>
                <p className="text-textMuted text-xs">Real-time event streaming</p>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="mt-8">
                <Alert
                  variant={error.type}
                  dismissible
                  onDismiss={() => setError(null)}
                >
                  {error.message}
                  {error.type === 'warning' && error.message.includes('Freighter') && (
                    <p className="mt-2 text-xs">
                      Get Freighter at <a href="https://freighter.app" target="_blank" rel="noopener noreferrer" className="underline">freighter.app</a>
                    </p>
                  )}
                </Alert>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4 animate-slide-up stagger-1">
              <TokenInfo publicKey={publicKey} />
            </div>
            <div className="lg:col-span-8 animate-slide-up stagger-2">
              <SwapPanel
                publicKey={publicKey}
                onSwapSuccess={() => setRefreshTrigger(p => p + 1)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
