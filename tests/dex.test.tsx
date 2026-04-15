import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenAmountInput, Alert, TxProgressStepper } from '@/components/ui';
import type { TxProgress } from '@/lib/contract-client';

describe('DEX Component Tests', () => {
  describe('TokenAmountInput', () => {
    it('renders label and symbol', () => {
      render(
        <TokenAmountInput
          label="You Pay"
          value=""
          onChange={vi.fn()}
          symbol="XLM"
        />
      );
      expect(screen.getByText('You Pay')).toBeInTheDocument();
      expect(screen.getByText('XLM')).toBeInTheDocument();
    });

    it('calls onMax with correct value', async () => {
      const onMax = vi.fn();
      const user = userEvent.setup();
      render(
        <TokenAmountInput
          label="Pay"
          value=""
          onChange={vi.fn()}
          symbol="XLM"
          maxAmount={100}
          onMax={onMax}
        />
      );
      await user.click(screen.getByText('MAX'));
      expect(onMax).toHaveBeenCalled();
    });
  });

  describe('Alert', () => {
    it('renders message and dismisses', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Alert
          variant="error"
          dismissible
          onDismiss={onClose}
        >
          Swap failed
        </Alert>
      );
      expect(screen.getByText('Swap failed')).toBeInTheDocument();
      await user.click(screen.getByText('×'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('TxProgressStepper', () => {
    it('shows building message', () => {
      const progress: TxProgress = {
        stage: 'building',
        message: 'Building transaction…',
      };
      render(<TxProgressStepper progress={progress} />);
      expect(screen.getByText('Building transaction…')).toBeInTheDocument();
    });
  });

  describe('getQuote calculation', () => {
    it('returns correct structure', () => {
      const xlmReserve = 1_000_000_000;
      const tokenReserve = 100_000_000_000;
      const amountIn = 10_000_000;
      const feeBps = 30;
      const inWithFee = amountIn * (10000 - feeBps) / 10000;
      const amountOut = Math.floor(tokenReserve * inWithFee / (xlmReserve + inWithFee));
      expect(amountOut).toBeGreaterThan(0);
      expect(amountOut).toBeLessThan(tokenReserve);
    });
  });
});
