'use client';

import React, { useState } from 'react';
import { FaTint } from 'react-icons/fa';
import { stellar, WalletNotFoundError, WalletRejectedError } from '../../lib/stellar-helper';
import { Navbar } from '../../components/Navbar';
import { PoolPanel } from '../../components/PoolPanel';
import { Alert, Card } from '../../components/ui';

export default function PoolPage() {
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
        setError({ type: 'warning', message: err.message });
      } else if (err instanceof WalletRejectedError) {
        setError({ type: 'info', message: err.message });
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
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="p-8 text-center max-w-md">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FaTint className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-serif text-2xl text-textMain mb-3">Connect to Continue</h2>
              <p className="text-textMuted text-sm mb-6">
                Connect your wallet to manage liquidity in the XLM/SVLT pool.
              </p>
              <button
                onClick={handleConnect}
                className="claude-button-primary px-8 py-3 w-full"
              >
                Connect Wallet
              </button>
              {error && (
                <div className="mt-4">
                  <Alert
                    variant={error.type}
                    dismissible
                    onDismiss={() => setError(null)}
                  >
                    {error.message}
                  </Alert>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-10">
            <PoolPanel
              publicKey={publicKey}
              onSuccess={() => setRefreshTrigger(p => p + 1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
