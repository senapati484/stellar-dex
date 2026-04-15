'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FaHome, FaExchangeAlt, FaTint, FaBell } from 'react-icons/fa';
import { stellar, WalletNotFoundError, WalletRejectedError } from '../lib/stellar-helper';
import { Alert } from './ui';

interface NavbarProps {
  publicKey: string;
  isConnected: boolean;
  onConnect: (key: string) => void;
  onDisconnect: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  publicKey,
  isConnected,
  onConnect,
  onDisconnect,
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState<{ type: 'warning' | 'info'; message: string } | null>(null);

  const handleConnect = async () => {
    try {
      setError(null);
      const address = await stellar.connectWallet();
      onConnect(address);
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
    onDisconnect();
  };

  const navLinks = [
    { href: '/', label: 'Swap', mobileLabel: 'Swap', icon: FaExchangeAlt },
    { href: '/pool', label: 'Pool', mobileLabel: 'Pool', icon: FaTint },
    { href: '/activity', label: 'Activity', mobileLabel: 'Activity', icon: FaBell },
  ];

  const isActive = (href: string) => pathname === href;

  const truncatedAddress = stellar.formatAddress(publicKey, 4, 4);

  return (
    <>
      {/* Desktop Navbar */}
      <nav className="hidden md:flex sticky top-0 h-[60px] bg-background/80 backdrop-blur-md border-b border-borderOuter items-center px-4 sm:px-6 z-50">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">
            Sd
          </div>
          <span className="font-serif text-lg text-textMain">StellarDEX</span>
          <span className="bg-borderInner text-textMuted text-xs px-2 py-0.5 rounded-full">
            Testnet
          </span>
        </div>

        {/* Center Nav Links */}
        <div className="flex-1 flex justify-center gap-8">
          {navLinks.map(link => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              className={`text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'text-textMain border-b-2 border-primary'
                  : 'text-textMuted hover:text-textMain'
              } pb-1`}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Right: Connection Status */}
        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm text-textMuted">Connected</span>
              </div>
              <span className="text-sm font-mono text-textMain">{truncatedAddress}</span>
              <button
                onClick={handleDisconnect}
                className="text-sm text-textMuted hover:text-textMain transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <nav className="md:hidden sticky top-0 h-[56px] bg-background/80 backdrop-blur-md border-b border-borderOuter items-center px-4 z-50 flex">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-xs">
            Sd
          </div>
          <span className="font-serif text-base text-textMain">StellarDEX</span>
        </div>

        {/* Right: Connect/Address */}
        <div className="ml-auto">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="text-sm font-mono text-textMain hover:text-textMuted transition-colors"
            >
              {truncatedAddress}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Nav Bar (only when connected) */}
      {isConnected && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-borderOuter z-50">
          <div className="flex items-center justify-around h-[56px] pb-[env(safe-area-inset-bottom)]">
            {/* Home */}
            <button
              onClick={() => router.push('/')}
              className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
                isActive('/') ? 'text-primary' : 'text-textMuted'
              }`}
            >
              <FaHome className="w-5 h-5" />
              <span className="text-[10px]">Home</span>
            </button>

            {/* Swap */}
            <button
              onClick={() => router.push('/')}
              className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
                isActive('/') ? 'text-primary' : 'text-textMuted'
              }`}
            >
              <FaExchangeAlt className="w-5 h-5" />
              <span className="text-[10px]">Swap</span>
            </button>

            {/* Pool */}
            <button
              onClick={() => router.push('/pool')}
              className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
                isActive('/pool') ? 'text-primary' : 'text-textMuted'
              }`}
            >
              <FaTint className="w-5 h-5" />
              <span className="text-[10px]">Pool</span>
            </button>

            {/* Activity */}
            <button
              onClick={() => router.push('/activity')}
              className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
                isActive('/activity') ? 'text-primary' : 'text-textMuted'
              }`}
            >
              <FaBell className="w-5 h-5" />
              <span className="text-[10px]">Activity</span>
            </button>
          </div>
        </nav>
      )}

      {/* Error Alert */}
      {error && (
        <div className="fixed top-20 md:top-24 left-4 right-4 z-[60]">
          <Alert
            variant={error.type}
            dismissible
            onDismiss={() => setError(null)}
          >
            {error.message}
          </Alert>
        </div>
      )}
    </>
  );
};
