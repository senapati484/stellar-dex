'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FaExchangeAlt, FaCog } from 'react-icons/fa';
import {
  createDexClient,
  TxProgress,
  SlippageExceededError,
  ContractError,
} from '../lib/contract-client';
import { stellar, InsufficientBalanceError, WalletRejectedError } from '../lib/stellar-helper';
import {
  TokenAmountInput,
  SwapArrow,
  TxProgressStepper,
  Alert,
} from './ui';

interface SwapPanelProps {
  publicKey: string;
  onSwapSuccess: () => void;
}

interface PoolInfo {
  xlmReserve: number;
  tokenReserve: number;
  totalLp: number;
  feeBps: number;
  cached: boolean;
}

interface Quote {
  amountOut: number;
  priceImpact: number;
  fee: number;
}

export const SwapPanel: React.FC<SwapPanelProps> = ({ publicKey, onSwapSuccess }) => {
  const [direction, setDirection] = useState<'xlm_to_token' | 'token_to_xlm'>('xlm_to_token');
  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [svltBalance, setSvltBalance] = useState(0);
  const [xlmBalance, setXlmBalance] = useState('0');
  const [progress, setProgress] = useState<TxProgress>({ stage: 'idle' });
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dexClient = createDexClient((p) => setProgress(p));

  // Load balances and pool info on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [poolData, balances] = await Promise.all([
          dexClient.getPoolInfo(),
          stellar.getBalance(publicKey),
        ]);
        setPoolInfo(poolData);
        setXlmBalance(balances.xlm);
        setSvltBalance(balances.svlt ? parseFloat(balances.svlt) : 0);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };
    loadData();
  }, [publicKey, dexClient]);

  // Debounced quote fetching
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (!amountIn || !poolInfo) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);
      setError(null);

      try {
        const amountInNum = parseFloat(amountIn);
        const stroops = Math.floor(amountInNum * 10_000_000);
        const quoteData = await dexClient.getQuote(direction, stroops);
        setQuote(quoteData);
      } catch (err) {
        console.error('Failed to get quote:', err);
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [amountIn, direction, poolInfo, dexClient]);

  const handleFlip = useCallback(() => {
    setDirection(prev => prev === 'xlm_to_token' ? 'token_to_xlm' : 'xlm_to_token');
    setAmountIn('');
    setQuote(null);
    setError(null);
  }, []);

  const handleMax = useCallback(() => {
    if (direction === 'xlm_to_token') {
      const maxXlm = parseFloat(xlmBalance);
      setAmountIn(maxXlm > 0 ? maxXlm.toString() : '');
    } else {
      const maxSvlt = svltBalance / 10_000_000;
      setAmountIn(maxSvlt > 0 ? maxSvlt.toString() : '');
    }
  }, [direction, xlmBalance, svltBalance]);

  const handleSwap = async () => {
    if (!amountIn || !quote) return;

    setError(null);
    setProgress({ stage: 'idle' });

    try {
      const amountInNum = parseFloat(amountIn);
      const stroops = Math.floor(amountInNum * 10_000_000);

      if (direction === 'xlm_to_token') {
        await dexClient.swapXlmForToken(publicKey, stroops);
      } else {
        await dexClient.swapTokenForXlm(publicKey, stroops);
      }

      // Success
      setTimeout(() => {
        onSwapSuccess();
        setAmountIn('');
        setQuote(null);
        setProgress({ stage: 'idle' });
        // Reload balances
        stellar.getBalance(publicKey, true).then(balances => {
          setXlmBalance(balances.xlm);
          setSvltBalance(balances.svlt ? parseFloat(balances.svlt) : 0);
        });
      }, 3000);
    } catch (err: unknown) {
      if (err instanceof SlippageExceededError) {
        setError('Price impact too high (>5%). Reduce swap amount.');
      } else if (err instanceof WalletRejectedError) {
        setError('Signing cancelled. Try again.');
      } else if (err instanceof InsufficientBalanceError) {
        setError('Insufficient balance. Check your XLM balance.');
      } else if (err instanceof ContractError) {
        setError(err.message);
      } else {
        setError('Swap failed. Please try again.');
      }
      setProgress({ stage: 'idle' });
    }
  };

  const fromSymbol = direction === 'xlm_to_token' ? 'XLM' : 'SVLT';
  const toSymbol = direction === 'xlm_to_token' ? 'SVLT' : 'XLM';
  const maxAmount = direction === 'xlm_to_token' ? parseFloat(xlmBalance) : svltBalance / 10_000_000;
  const formattedAmountOut = quote ? (quote.amountOut / 10_000_000).toFixed(6) : '0';
  const priceImpactColor = quote?.priceImpact && quote.priceImpact > 3 ? 'text-red-700' : quote?.priceImpact && quote.priceImpact > 1 ? 'text-red-500' : 'text-textMain';
  const showSlippageWarning = quote && quote.priceImpact > 1;

  // Calculate rate
  const rate = poolInfo
    ? direction === 'xlm_to_token'
      ? poolInfo.tokenReserve / poolInfo.xlmReserve
      : poolInfo.xlmReserve / poolInfo.tokenReserve
    : 0;

  // Calculate min received (5% slippage)
  const minReceived = quote ? (quote.amountOut * 0.95) / 10_000_000 : 0;

  return (
    <div className="claude-card p-4 sm:p-6 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <FaExchangeAlt className="w-5 h-5 text-primary" />
          </div>
          <span className="font-serif text-xl text-textMain">Swap</span>
        </div>
        <button className="text-textMuted hover:text-textMain transition-colors">
          <FaCog className="w-5 h-5" />
        </button>
      </div>

      {/* Swap Interface */}
      <div className="space-y-4">
        {/* FROM Input */}
        <TokenAmountInput
          label="You Pay"
          value={amountIn}
          onChange={setAmountIn}
          symbol={fromSymbol}
          maxAmount={maxAmount}
          onMax={handleMax}
          disabled={progress.stage !== 'idle'}
        />

        {/* Swap Arrow */}
        <SwapArrow onClick={handleFlip} loading={progress.stage !== 'idle'} />

        {/* TO Input */}
        <TokenAmountInput
          label="You Receive"
          value={quoteLoading ? '...' : formattedAmountOut}
          onChange={() => {}}
          symbol={toSymbol}
          disabled
        />

        {/* Quote Details */}
        {quote && poolInfo && (
          <div className="bg-[#F4F2EC] border border-[#E9E7E0] rounded-lg p-3 sm:p-4 space-y-1.5">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-textMuted">Rate</span>
              <span className="text-textMain font-mono">
                1 {direction === 'xlm_to_token' ? 'XLM' : 'SVLT'} = {rate.toFixed(6)} {direction === 'xlm_to_token' ? 'SVLT' : 'XLM'}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-textMuted">Price Impact</span>
              <span className={`font-mono ${priceImpactColor}`}>
                {quote.priceImpact.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-textMuted">Fee (0.3%)</span>
              <span className="text-textMain font-mono">
                {(quote.fee / 10_000_000).toFixed(6)} {direction === 'xlm_to_token' ? 'XLM' : 'SVLT'}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-textMuted">Min. Received</span>
              <span className="text-textMain font-mono">
                {minReceived.toFixed(6)} {toSymbol}
              </span>
            </div>
          </div>
        )}

        {/* Tx Progress Stepper */}
        {progress.stage !== 'idle' && <TxProgressStepper progress={progress} />}

        {/* Error Alert */}
        {error && (
          <Alert variant="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Slippage Warning */}
        {showSlippageWarning && progress.stage === 'idle' && (
          <Alert variant="warning">
            Price impact is {quote!.priceImpact.toFixed(2)}%. Consider reducing your swap amount.
          </Alert>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSwap}
          disabled={!amountIn || !quote || progress.stage !== 'idle'}
          className="claude-button-primary w-full py-4 rounded-lg font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ minHeight: '52px' }}
        >
          {progress.stage === 'idle'
            ? `Swap ${fromSymbol} → ${toSymbol}`
            : 'Processing...'}
        </button>
      </div>
    </div>
  );
};
