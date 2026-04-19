'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FaTint } from 'react-icons/fa';
import {
  createDexClient,
  TxProgress,
  SlippageExceededError,
  ContractError,
} from '../lib/contract-client';
import { stellar, InsufficientBalanceError, WalletRejectedError } from '../lib/stellar-helper';
import {
  TokenAmountInput,
  PoolShareBar,
  StatCard,
  TxProgressStepper,
  Alert,
  Button,
  Card,
} from './ui';

interface PoolPanelProps {
  publicKey: string;
  onSuccess: () => void;
}

interface PoolInfo {
  xlmReserve: number;
  tokenReserve: number;
  totalLp: number;
  feeBps: number;
  cached: boolean;
}

export const PoolPanel: React.FC<PoolPanelProps> = ({ publicKey, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'add' | 'remove'>('add');
  const [xlmAmount, setXlmAmount] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [lpAmount, setLpAmount] = useState('');
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [myLpBalance, setMyLpBalance] = useState(0);
  const [progress, setProgress] = useState<TxProgress>({ stage: 'idle' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMounted = React.useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const progressCallback = useCallback((p: TxProgress) => {
    if (isMounted.current) {
      setProgress(p);
    }
  }, []);

  const dexClient = useMemo(() => createDexClient(progressCallback), [progressCallback]);

  // Load pool info and LP balance on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [poolData, lpBalance] = await Promise.all([
          dexClient.getPoolInfo(),
          dexClient.getLpBalance(publicKey),
        ]);
        setPoolInfo(poolData);
        setMyLpBalance(lpBalance);
      } catch (err) {
        console.error('Failed to load pool data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [publicKey, dexClient]);

  const isUpdatingRef = React.useRef(false);

  // Auto-calculate paired amount when user types
  useEffect(() => {
    if (!poolInfo || isUpdatingRef.current) return;

    if (activeTab === 'add') {
      if (xlmAmount) {
        isUpdatingRef.current = true;
        const xlmNum = parseFloat(xlmAmount);
        const tokenNum = xlmNum * (poolInfo.tokenReserve / poolInfo.xlmReserve);
        setTokenAmount(tokenNum > 0 ? tokenNum.toFixed(6) : '');
        setTimeout(() => { isUpdatingRef.current = false; }, 0);
      } else {
        isUpdatingRef.current = true;
        setTokenAmount('');
        setTimeout(() => { isUpdatingRef.current = false; }, 0);
      }
    }
  }, [xlmAmount, poolInfo, activeTab]);

  useEffect(() => {
    if (!poolInfo || isUpdatingRef.current) return;

    if (activeTab === 'add') {
      if (tokenAmount) {
        isUpdatingRef.current = true;
        const tokenNum = parseFloat(tokenAmount);
        const xlmNum = tokenNum * (poolInfo.xlmReserve / poolInfo.tokenReserve);
        setXlmAmount(xlmNum > 0 ? xlmNum.toFixed(6) : '');
        setTimeout(() => { isUpdatingRef.current = false; }, 0);
      } else if (!xlmAmount) { // only clear if xlm is also cleared to avoid cycle
        isUpdatingRef.current = true;
        setXlmAmount('');
        setTimeout(() => { isUpdatingRef.current = false; }, 0);
      }
    }
  }, [tokenAmount, poolInfo, activeTab]);

  const handleXlmMax = useCallback(() => {
    if (poolInfo) {
      setXlmAmount(poolInfo.xlmReserve.toFixed(6));
    }
  }, [poolInfo]);

  const handleTokenMax = useCallback(() => {
    if (poolInfo) {
      setTokenAmount(poolInfo.tokenReserve.toFixed(6));
    }
  }, [poolInfo]);

  const handleLpMax = useCallback(() => {
    const maxLp = myLpBalance / 10_000_000;
    setLpAmount(maxLp > 0 ? maxLp.toString() : '');
  }, [myLpBalance]);

  const handleAddLiquidity = async () => {
    if (!xlmAmount || !tokenAmount || !poolInfo) return;

    setError(null);
    setProgress({ stage: 'idle' });

    try {
      const xlmStroops = Math.floor(parseFloat(xlmAmount) * 10_000_000);
      const tokenStroops = Math.floor(parseFloat(tokenAmount) * 10_000_000);

      await dexClient.addLiquidity(publicKey, xlmStroops, tokenStroops);

      setTimeout(() => {
        onSuccess();
        setXlmAmount('');
        setTokenAmount('');
        setProgress({ stage: 'idle' });
        // Reload data
        Promise.all([
          dexClient.getPoolInfo(),
          dexClient.getLpBalance(publicKey),
        ]).then(([poolData, lpBalance]) => {
          setPoolInfo(poolData);
          setMyLpBalance(lpBalance);
        });
      }, 3000);
    } catch (err: unknown) {
      if (err instanceof SlippageExceededError) {
        setError('Price impact too high (>5%). Try a smaller swap amount.');
      } else if (err instanceof WalletRejectedError) {
        setError('You cancelled the signing. Click to try again.');
      } else if (err instanceof InsufficientBalanceError) {
        setError('Insufficient XLM balance. You need at least 1.5 XLM for network fees.');
      } else if (err instanceof ContractError) {
        setError(`${err.message}. Check https://stellar.expert for transaction details`);
      } else {
        setError('Failed to add liquidity. Please try again.');
      }
      setProgress({ stage: 'idle' });
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!lpAmount) return;

    setError(null);
    setProgress({ stage: 'idle' });

    try {
      const lpStroops = Math.floor(parseFloat(lpAmount) * 10_000_000);

      await dexClient.removeLiquidity(publicKey, lpStroops);

      setTimeout(() => {
        onSuccess();
        setLpAmount('');
        setProgress({ stage: 'idle' });
        // Reload data
        Promise.all([
          dexClient.getPoolInfo(),
          dexClient.getLpBalance(publicKey),
        ]).then(([poolData, lpBalance]) => {
          setPoolInfo(poolData);
          setMyLpBalance(lpBalance);
        });
      }, 3000);
    } catch (err: unknown) {
      if (err instanceof WalletRejectedError) {
        setError('You cancelled the signing. Click to try again.');
      } else if (err instanceof InsufficientBalanceError) {
        setError('Insufficient XLM balance. You need at least 1.5 XLM for network fees.');
      } else if (err instanceof ContractError) {
        setError(`${err.message}. Check https://stellar.expert for transaction details`);
      } else {
        setError('Failed to remove liquidity. Please try again.');
      }
      setProgress({ stage: 'idle' });
    }
  };

  // Calculate shares
  const myShare = poolInfo && poolInfo.totalLp > 0 ? (myLpBalance / poolInfo.totalLp) * 100 : 0;
  const estimatedNewLp = poolInfo && xlmAmount && tokenAmount
    ? Math.sqrt(
        (parseFloat(xlmAmount) * 10_000_000 * parseFloat(tokenAmount) * 10_000_000) /
        (poolInfo.xlmReserve * poolInfo.tokenReserve)
      ) * poolInfo.totalLp - poolInfo.totalLp
    : 0;
  const newShare = poolInfo && estimatedNewLp > 0
    ? ((myLpBalance + estimatedNewLp) / (poolInfo.totalLp + estimatedNewLp)) * 100
    : myShare;
  const remainingShare = poolInfo && lpAmount
    ? ((myLpBalance - parseFloat(lpAmount) * 10_000_000) / (poolInfo.totalLp - parseFloat(lpAmount) * 10_000_000)) * 100
    : myShare;
  const isRemovingAll = lpAmount && poolInfo && parseFloat(lpAmount) * 10_000_000 >= myLpBalance;

  // Calculate removal preview
  const xlmOut = poolInfo && lpAmount
    ? (parseFloat(lpAmount) * 10_000_000 / poolInfo.totalLp) * poolInfo.xlmReserve / 10_000_000
    : 0;
  const tokenOut = poolInfo && lpAmount
    ? (parseFloat(lpAmount) * 10_000_000 / poolInfo.totalLp) * poolInfo.tokenReserve / 10_000_000
    : 0;

  if (loading) {
    return (
      <Card className="p-4 sm:p-6 max-w-md mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full border-4 border-primary border-t-transparent w-12 h-12" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <FaTint className="w-5 h-5 text-primary" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-serif text-xl text-textMain">Liquidity Pool</span>
          <span className="bg-borderInner text-textMuted text-xs px-2 py-0.5 rounded-full">
            XLM/SVLT
          </span>
        </div>
      </div>

      {/* Pool Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="XLM Reserve"
          value={poolInfo ? (poolInfo.xlmReserve / 10_000_000).toFixed(2) : '0'}
          loading={loading}
        />
        <StatCard
          label="SVLT Reserve"
          value={poolInfo ? (poolInfo.tokenReserve / 10_000_000).toFixed(4) : '0'}
          loading={loading}
        />
        <StatCard
          label="Total LP"
          value={poolInfo ? (poolInfo.totalLp / 10_000_000).toFixed(2) : '0'}
          loading={loading}
        />
        <StatCard
          label="Fee"
          value="0.30%"
          loading={loading}
        />
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'add' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('add')}
          className="flex-1"
          disabled={progress.stage !== 'idle'}
        >
          Add Liquidity
        </Button>
        <Button
          variant={activeTab === 'remove' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('remove')}
          className="flex-1"
          disabled={progress.stage !== 'idle'}
        >
          Remove Liquidity
        </Button>
      </div>

      {/* ADD Tab */}
      {activeTab === 'add' && (
        <div className="space-y-4">
          <TokenAmountInput
            label="XLM Amount"
            value={xlmAmount}
            onChange={setXlmAmount}
            symbol="XLM"
            maxAmount={poolInfo ? poolInfo.xlmReserve / 10_000_000 : 0}
            onMax={handleXlmMax}
            disabled={progress.stage !== 'idle'}
          />

          <TokenAmountInput
            label="SVLT Amount"
            value={tokenAmount}
            onChange={setTokenAmount}
            symbol="SVLT"
            maxAmount={poolInfo ? poolInfo.tokenReserve / 10_000_000 : 0}
            onMax={handleTokenMax}
            disabled={progress.stage !== 'idle'}
          />

          {/* Pool Share Bar */}
          <div className="bg-[#F4F2EC] border border-[#E9E7E0] rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-textMuted">Your Pool Share</span>
              <span className="text-sm font-medium text-textMain">
                {newShare.toFixed(2)}%
              </span>
            </div>
            <PoolShareBar share={newShare} />
            <p className="text-xs text-textMuted mt-2">
              Current: {myShare.toFixed(2)}% → After adding: {newShare.toFixed(2)}%
            </p>
          </div>

          <p className="text-xs text-textMuted text-center">
            You will receive LP tokens representing your pool share
          </p>

          <Button
            onClick={handleAddLiquidity}
            disabled={!xlmAmount || !tokenAmount || progress.stage !== 'idle'}
            loading={progress.stage !== 'idle'}
            className="w-full"
          >
            Add Liquidity
          </Button>
        </div>
      )}

      {/* REMOVE Tab */}
      {activeTab === 'remove' && (
        <div className="space-y-4">
          <TokenAmountInput
            label="LP Token Amount"
            value={lpAmount}
            onChange={setLpAmount}
            symbol="LP"
            maxAmount={myLpBalance / 10_000_000}
            onMax={handleLpMax}
            disabled={progress.stage !== 'idle'}
          />

          {/* Removal Preview */}
          {lpAmount && poolInfo && (
            <div className="bg-[#F4F2EC] border border-[#E9E7E0] rounded-lg p-4">
              <p className="text-sm text-textMuted mb-2">You will receive:</p>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-textMain">XLM</span>
                <span className="font-mono text-textMain">{xlmOut.toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-textMain">SVLT</span>
                <span className="font-mono text-textMain">{tokenOut.toFixed(6)}</span>
              </div>
            </div>
          )}

          {/* Pool Share Bar */}
          {lpAmount && poolInfo && (
            <div className="bg-[#F4F2EC] border border-[#E9E7E0] rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-textMuted">Remaining Share</span>
                <span className="text-sm font-medium text-textMain">
                  {remainingShare.toFixed(2)}%
                </span>
              </div>
              <PoolShareBar share={remainingShare} />
            </div>
          )}

          {isRemovingAll && (
            <Alert variant="warning">
              You will exit the pool entirely
            </Alert>
          )}

          <Button
            onClick={handleRemoveLiquidity}
            disabled={!lpAmount || progress.stage !== 'idle'}
            loading={progress.stage !== 'idle'}
            className="w-full"
          >
            Remove Liquidity
          </Button>
        </div>
      )}

      {/* Tx Progress Stepper */}
      {progress.stage !== 'idle' && <TxProgressStepper progress={progress} />}

      {/* Error Alert */}
      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
          {error.includes('XLM balance') && (
            <p className="mt-2 text-xs">
              Fund your testnet account at <a href="https://friendbot.stellar.org" target="_blank" rel="noopener noreferrer" className="underline">friendbot.stellar.org</a>
            </p>
          )}
        </Alert>
      )}
    </Card>
  );
};
