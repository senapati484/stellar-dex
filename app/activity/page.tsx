'use client';

import React, { useState } from 'react';
import { FaBell } from 'react-icons/fa';
import { stellar, WalletNotFoundError, WalletRejectedError } from '../../lib/stellar-helper';
import { Navbar } from '../../components/Navbar';
import { ActivityFeed } from '../../components/ActivityFeed';
import { Alert, Card } from '../../components/ui';

export const dynamic = 'force-dynamic';

export default function ActivityPage() {
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
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="p-8 text-center max-w-md">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FaBell className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-serif text-2xl text-textMain mb-3">Connect to Continue</h2>
              <p className="text-textMuted text-sm mb-6">
                Connect your wallet to view live activity from StellarDEX contracts.
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
                    {error.type === 'warning' && error.message.includes('Freighter') && (
                      <p className="mt-2 text-xs">
                        Get Freighter at <a href="https://freighter.app" target="_blank" rel="noopener noreferrer" className="underline">freighter.app</a>
                      </p>
                    )}
                  </Alert>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-10">
            <div className="mb-6 animate-slide-up">
              <h1 className="text-3xl font-serif font-medium text-textMain tracking-tight mb-1">
                Live Activity
              </h1>
              <p className="text-textMuted text-sm">
                Real-time event stream from all StellarDEX contracts.
                Polls every 8 seconds, adaptive based on page visibility.
              </p>
            </div>
            <ActivityFeed refreshTrigger={refreshTrigger} />
          </div>
        )}
      </div>
    </div>
  );
}
