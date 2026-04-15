'use client';

import React, { useState, useCallback } from 'react';
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

  const handleConnect = useCallback(async () => {
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
  }, []);

  const handleDisconnect = useCallback(() => {
    stellar.disconnect();
    setPublicKey('');
    setIsConnected(false);
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3EFEC' }}>
      <Navbar
        publicKey={publicKey}
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {!isConnected ? (
          <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
            {/* Hero */}
            <div style={{
              padding: '4rem 2rem',
              backgroundColor: '#FAF9F7',
              border: '1px solid #E8E5E0',
              borderRadius: '1.5rem',
              marginBottom: '2rem'
            }}>
              <h1 style={{
                fontSize: '3rem',
                fontWeight: 'bold',
                color: '#24211D',
                marginBottom: '1rem',
              }}>
                StellarDEX
              </h1>
              <p style={{
                color: '#7A7570',
                fontSize: '1.1rem',
                marginBottom: '2rem',
              }}>
                A mini decentralized exchange built on Soroban smart contracts.
              </p>
              <button
                onClick={handleConnect}
                style={{
                  backgroundColor: '#C96442',
                  color: 'white',
                  padding: '0.75rem 2.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#24211D')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#C96442')}
              >
                Connect Wallet
              </button>

              {/* Contract badges */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  border: '1px solid #C96442',
                  borderRadius: '0.5rem',
                  backgroundColor: 'rgba(201, 100, 66, 0.1)',
                  color: '#C96442',
                }}>
                  Token: SVLT
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  border: '1px solid #1D4ED8',
                  borderRadius: '0.5rem',
                  backgroundColor: 'rgba(29, 78, 216, 0.1)',
                  color: '#1D4ED8',
                }}>
                  Pool: XLM/SVLT
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.5rem 1rem',
                  border: '1px solid #059669',
                  borderRadius: '0.5rem',
                  backgroundColor: 'rgba(5, 150, 105, 0.1)',
                  color: '#059669',
                }}>
                  Fee: 0.30%
                </span>
              </div>
            </div>

            {/* Feature grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginTop: '2rem'
            }}>
              <div style={{
                backgroundColor: '#FAF9F7',
                border: '1px solid #E8E5E0',
                borderRadius: '1rem',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
                <h3 style={{ fontSize: '1rem', color: '#24211D', fontWeight: 'bold', marginBottom: '0.5rem' }}>Swap</h3>
                <p style={{ fontSize: '0.875rem', color: '#7A7570' }}>Instant XLM SVLT swaps</p>
              </div>
              <div style={{
                backgroundColor: '#FAF9F7',
                border: '1px solid #E8E5E0',
                borderRadius: '1rem',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💧</div>
                <h3 style={{ fontSize: '1rem', color: '#24211D', fontWeight: 'bold', marginBottom: '0.5rem' }}>Liquidity</h3>
                <p style={{ fontSize: '0.875rem', color: '#7A7570' }}>Earn 0.3% fees as LP</p>
              </div>
              <div style={{
                backgroundColor: '#FAF9F7',
                border: '1px solid #E8E5E0',
                borderRadius: '1rem',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔗</div>
                <h3 style={{ fontSize: '1rem', color: '#24211D', fontWeight: 'bold', marginBottom: '0.5rem' }}>On-chain</h3>
                <p style={{ fontSize: '0.875rem', color: '#7A7570' }}>3 Soroban contracts</p>
              </div>
              <div style={{
                backgroundColor: '#FAF9F7',
                border: '1px solid #E8E5E0',
                borderRadius: '1rem',
                padding: '1rem',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📡</div>
                <h3 style={{ fontSize: '1rem', color: '#24211D', fontWeight: 'bold', marginBottom: '0.5rem' }}>Live</h3>
                <p style={{ fontSize: '0.875rem', color: '#7A7570' }}>Real-time event streaming</p>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div style={{ marginTop: '2rem' }}>
                <Alert
                  variant={error.type}
                  dismissible
                  onDismiss={() => setError(null)}
                >
                  {error.message}
                  {error.type === 'warning' && error.message.includes('Freighter') && (
                    <p style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                      Get Freighter at <a href="https://freighter.app" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>freighter.app</a>
                    </p>
                  )}
                </Alert>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            <div>
              <TokenInfo publicKey={publicKey} />
            </div>
            <div>
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
