'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaBell, FaSync, FaExchangeAlt, FaPlus, FaMinus, FaCoins } from 'react-icons/fa';
import { stellar } from '../lib/stellar-helper';
import { Card, EmptyState, SkeletonLoader, Button } from './ui';

interface ActivityFeedProps {
  refreshTrigger: number;
}

interface DexEvent {
  id: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity' | 'transfer' | 'mint';
  address: string;
  amountA?: number;
  amountB?: number;
  txHash: string;
  timestamp: number;
  contractId: string;
}

const POOL_ID = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID!;
const REGISTRY_ID = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID!;
const TOKEN_ID = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID!;

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ refreshTrigger }) => {
  const [events, setEvents] = useState<DexEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'swap' | 'liquidity' | 'token'>('all');
  const [polling, setPolling] = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [timeUntilNextPoll, setTimeUntilNextPoll] = useState(8);
  const [pollCount, setPollCount] = useState(0);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const parseTransactionToEvent = useCallback((tx: any, contractId: string): DexEvent | null => {
    try {
      const operations = tx.operations || [];
      if (operations.length === 0) return null;

      const op = operations[0];
      const type = op.type;
      const address = tx.source_account;
      const txHash = tx.hash;
      const timestamp = new Date(tx.created_at).getTime();

      let eventType: DexEvent['type'] | null = null;
      let amountA: number | undefined;
      let amountB: number | undefined;

      // Parse operation type and amounts based on contract
      if (contractId === POOL_ID) {
        if (type === 'invoke_host_function') {
          // Check function name in body
          const body = op.body?.invoke_host_function?.function;
          if (body === 'swap') {
            eventType = 'swap';
            // Parse amounts from operation parameters (simplified)
            const params = op.body?.invoke_host_function?.parameters || [];
            if (params.length >= 2) {
              amountA = params[0]?.value?.u128 ? Number(params[0].value.u128) : undefined;
              amountB = params[1]?.value?.u128 ? Number(params[1].value.u128) : undefined;
            }
          } else if (body === 'add_liquidity') {
            eventType = 'add_liquidity';
            const params = op.body?.invoke_host_function?.parameters || [];
            if (params.length >= 2) {
              amountA = params[0]?.value?.u128 ? Number(params[0].value.u128) : undefined;
              amountB = params[1]?.value?.u128 ? Number(params[1].value.u128) : undefined;
            }
          } else if (body === 'remove_liquidity') {
            eventType = 'remove_liquidity';
            const params = op.body?.invoke_host_function?.parameters || [];
            if (params.length >= 1) {
              amountA = params[0]?.value?.u128 ? Number(params[0].value.u128) : undefined;
            }
          }
        }
      } else if (contractId === TOKEN_ID) {
        if (type === 'invoke_host_function') {
          const body = op.body?.invoke_host_function?.function;
          if (body === 'transfer') {
            eventType = 'transfer';
            const params = op.body?.invoke_host_function?.parameters || [];
            if (params.length >= 1) {
              amountA = params[0]?.value?.u128 ? Number(params[0].value.u128) : undefined;
            }
          } else if (body === 'mint') {
            eventType = 'mint';
            const params = op.body?.invoke_host_function?.parameters || [];
            if (params.length >= 1) {
              amountA = params[0]?.value?.u128 ? Number(params[0].value.u128) : undefined;
            }
          }
        }
      } else if (contractId === REGISTRY_ID) {
        // Registry events - mostly metadata updates
        eventType = 'transfer'; // Fallback for registry events
      }

      if (!eventType) return null;

      return {
        id: txHash,
        type: eventType,
        address,
        amountA,
        amountB,
        txHash,
        timestamp,
        contractId,
      };
    } catch (err) {
      console.error('Failed to parse transaction:', err);
      return null;
    }
  }, []);

  const pollEvents = useCallback(async () => {
    try {
      const poolTxns = await stellar.horizon
        .transactions()
        .forAccount(POOL_ID)
        .limit(20)
        .order('desc')
        .call();

      const registryTxns = await stellar.horizon
        .transactions()
        .forAccount(REGISTRY_ID)
        .limit(10)
        .order('desc')
        .call();

      const tokenTxns = await stellar.horizon
        .transactions()
        .forAccount(TOKEN_ID)
        .limit(10)
        .order('desc')
        .call();

      const allTxns = [
        ...poolTxns.records.map((tx: any) => ({ tx, contractId: POOL_ID })),
        ...registryTxns.records.map((tx: any) => ({ tx, contractId: REGISTRY_ID })),
        ...tokenTxns.records.map((tx: any) => ({ tx, contractId: TOKEN_ID })),
      ];

      const parsedEvents = allTxns
        .map(({ tx, contractId }) => parseTransactionToEvent(tx, contractId))
        .filter((e): e is DexEvent => e !== null);

      // Deduplicate by txHash
      const eventMap = new Map<string, DexEvent>();
      parsedEvents.forEach(event => {
        eventMap.set(event.txHash, event);
      });

      const deduplicatedEvents = Array.from(eventMap.values());
      const sortedEvents = deduplicatedEvents.sort((a, b) => b.timestamp - a.timestamp);

      // Mark new events
      setEvents(prevEvents => {
        const existingIds = new Set(prevEvents.map(e => e.txHash));
        const newIds = new Set(
          sortedEvents
            .filter(e => !existingIds.has(e.txHash))
            .map(e => e.txHash)
        );

        setNewEventIds(newIds);
        
        // Clear new event IDs after 2s
        setTimeout(() => {
          setNewEventIds(new Set());
        }, 2000);

        return sortedEvents;
      });

      setLastPoll(new Date());
      setPollCount(prev => prev + 1);
    } catch (err) {
      console.error('Failed to poll events:', err);
    }
  }, [parseTransactionToEvent]);

  // Adaptive polling based on visibility
  useEffect(() => {
    const startPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      const isVisible = document.visibilityState === 'visible';
      // Increased from 3s to 15s visible, 12s to 30s hidden to reduce API calls
      const interval = isVisible ? 15000 : 30000;

      pollingIntervalRef.current = setInterval(() => {
        pollEvents();
      }, interval);

      setTimeUntilNextPoll(interval / 1000);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }

      // Only update countdown UI every second
      countdownIntervalRef.current = setInterval(() => {
        setTimeUntilNextPoll(prev => Math.max(0, prev - 1));
      }, 1000);
    };

    startPolling();

    const handleVisibilityChange = () => {
      startPolling();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pollEvents]);

  // Initial load
  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await pollEvents();
      setLoading(false);
    };
    initialLoad();
  }, [pollEvents]);

  // Manual refresh
  const handleRefresh = useCallback(() => {
    pollEvents();
  }, [pollEvents]);

  // Filter events
  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'swap') return event.type === 'swap';
    if (filter === 'liquidity') return event.type === 'add_liquidity' || event.type === 'remove_liquidity';
    if (filter === 'token') return event.type === 'transfer' || event.type === 'mint';
    return true;
  });

  // Get event icon and styling
  const getEventIcon = (type: DexEvent['type']) => {
    switch (type) {
      case 'swap':
        return {
          icon: <FaExchangeAlt className="w-4 h-4 text-swapGreen" />,
          className: 'bg-[#F0FDF4] border-[#D1FAE5]',
        };
      case 'add_liquidity':
        return {
          icon: <FaPlus className="w-4 h-4 text-blue-600" />,
          className: 'bg-blue-50 border-blue-100',
        };
      case 'remove_liquidity':
        return {
          icon: <FaMinus className="w-4 h-4 text-amber-600" />,
          className: 'bg-amber-50 border-amber-100',
        };
      case 'transfer':
      case 'mint':
        return {
          icon: <FaCoins className="w-4 h-4 text-textMuted" />,
          className: 'bg-surface border-borderInner',
        };
    }
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Format amount
  const formatAmount = (stroops?: number) => {
    if (stroops === undefined) return '0';
    return (stroops / 10_000_000).toFixed(6);
  };

  // Get event label
  const getEventLabel = (event: DexEvent) => {
    switch (event.type) {
      case 'swap':
        return 'Swap';
      case 'add_liquidity':
        return 'Add Liquidity';
      case 'remove_liquidity':
        return 'Remove Liquidity';
      case 'transfer':
        return 'Transfer';
      case 'mint':
        return 'Mint';
    }
  };

  // Get amount display
  const getAmountDisplay = (event: DexEvent) => {
    if (event.type === 'swap' && event.amountA !== undefined && event.amountB !== undefined) {
      return `${formatAmount(event.amountA)} XLM → ${formatAmount(event.amountB)} SVLT`;
    }
    if (event.type === 'add_liquidity' && event.amountA !== undefined && event.amountB !== undefined) {
      return `${formatAmount(event.amountA)} XLM + ${formatAmount(event.amountB)} SVLT`;
    }
    if (event.type === 'remove_liquidity' && event.amountA !== undefined) {
      return `${formatAmount(event.amountA)} LP`;
    }
    if ((event.type === 'transfer' || event.type === 'mint') && event.amountA !== undefined) {
      return `${formatAmount(event.amountA)} SVLT`;
    }
    return '';
  };

  if (loading) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <SkeletonLoader key={i} height="h-16" className="w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <FaBell className="w-5 h-5 text-primary" />
          </div>
          <span className="font-serif text-xl text-textMain">Live Activity</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${polling ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-xs text-textMuted">
              Live · Polling {timeUntilNextPoll}s
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="min-h-[36px]"
          >
            <FaSync className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 sm:pb-0">
        {(['all', 'swap', 'liquidity', 'token'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-surface border border-borderInner text-textMuted hover:text-textMain'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Event List */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
        {filteredEvents.length === 0 ? (
          <EmptyState
            icon="📡"
            title="Waiting for activity"
            description="Events will appear here as transactions hit the network"
          />
        ) : (
          filteredEvents.map(event => {
            const { icon, className } = getEventIcon(event.type);
            const isNew = newEventIds.has(event.txHash);

            return (
              <div
                key={event.txHash}
                className={`bg-surface border border-borderInner rounded-xl p-3 sm:p-4 transition-all duration-300 ${
                  isNew ? 'animate-price-flash bg-green-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${className} flex-shrink-0`}>
                    {icon}
                  </div>

                  {/* Center */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-textMain font-medium text-sm">
                        {getEventLabel(event)}
                      </span>
                    </div>
                    <div className="text-xs text-textMuted mb-1">
                      {stellar.formatAddress(event.address, 4, 4)}
                    </div>
                    <div className="text-xs text-textMain hidden sm:block">
                      {getAmountDisplay(event)}
                    </div>
                  </div>

                  {/* Right */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-textMuted">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                    <a
                      href={stellar.getExplorerLink(event.txHash, 'tx')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent text-xs hover:underline"
                    >
                      View tx
                    </a>
                  </div>
                </div>

                {/* Mobile amount (shown below on small screens) */}
                <div className="text-xs text-textMain sm:hidden mt-2">
                  {getAmountDisplay(event)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-borderInner flex justify-between items-center text-xs text-textMuted">
        <span>
          Last updated: {lastPoll ? formatRelativeTime(lastPoll.getTime()) : 'Never'}
        </span>
        <span>Poll #{pollCount}</span>
      </div>
    </Card>
  );
};
