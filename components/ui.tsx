'use client';

import React from 'react';
import { FaCheck, FaTimes, FaExchangeAlt } from 'react-icons/fa';
import type { TxProgress } from '../lib/contract-client';

// ==================== LoadingSpinner ====================

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'white' | 'muted';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const colorClasses = {
    primary: 'border-primary',
    white: 'border-white',
    muted: 'border-textMuted',
  };

  return (
    <div
      className={`animate-spin rounded-full border-2 ${sizeClasses[size]} ${colorClasses[color]} border-t-transparent`}
      role="status"
      aria-label="Loading"
    />
  );
};

// ==================== TxProgressStepper ====================

interface TxProgressStepperProps {
  progress: TxProgress;
}

export const TxProgressStepper: React.FC<TxProgressStepperProps> = ({ progress }) => {
  const steps = [
    { key: 'building', label: 'Building' },
    { key: 'signing', label: 'Signing' },
    { key: 'submitting', label: 'Submitting' },
    { key: 'confirming', label: 'Confirming' },
  ];

  const getStepStatus = (stepKey: string) => {
    if (progress.stage === 'error') {
      const stepIndex = steps.findIndex(s => s.key === stepKey);
      const currentIndex = steps.findIndex(s => s.key === progress.stage);
      return stepIndex < currentIndex ? 'done' : 'pending';
    }
    if (progress.stage === 'success') return 'done';
    if (progress.stage === stepKey) return 'active';
    const currentIndex = steps.findIndex(s => s.key === progress.stage);
    const stepIndex = steps.findIndex(s => s.key === stepKey);
    return stepIndex < currentIndex ? 'done' : 'pending';
  };

  const renderStepIcon = (status: string) => {
    if (status === 'active') return <LoadingSpinner size="sm" color="primary" />;
    if (status === 'done') return <FaCheck className="w-4 h-4 text-green-500" />;
    if (status === 'error') return <FaTimes className="w-4 h-4 text-red-500" />;
    return <div className="w-4 h-4 rounded-full border-2 border-textMuted" />;
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        {steps.map((step, index) => (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              {renderStepIcon(getStepStatus(step.key))}
              <span className="hidden sm:inline text-sm text-textMuted">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className="hidden sm:block w-8 h-0.5 bg-borderInner" />
            )}
          </React.Fragment>
        ))}
      </div>

      {progress.stage !== 'idle' && (
        <div className="mt-3 text-sm text-textMain">
          {progress.stage === 'success' ? (
            <div className="flex items-center gap-2">
              <span className="text-green-500">{progress.message}</span>
              <span className="text-textMuted font-mono text-xs">
                {progress.hash.slice(0, 8)}...{progress.hash.slice(-8)}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(progress.hash)}
                className="text-primary hover:underline text-xs"
              >
                Copy
              </button>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${progress.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-xs"
              >
                Explorer
              </a>
            </div>
          ) : progress.stage === 'error' ? (
            <div>
              <span className="text-red-500">{progress.message}</span>
              <span className="text-textMuted ml-2">Please try again</span>
            </div>
          ) : (
            <span>{progress.message}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== PriceDisplay ====================

interface PriceDisplayProps {
  price: number;
  symbol: string;
  direction: 'up' | 'down' | 'neutral';
  loading?: boolean;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  price,
  symbol,
  direction,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="w-full flex justify-center">
        <LoadingSpinner size="lg" color="muted" />
      </div>
    );
  }

  const directionIcon = {
    up: '↑',
    down: '↓',
    neutral: '—',
  }[direction];

  const directionColor = {
    up: 'text-swapGreen',
    down: 'text-error',
    neutral: 'text-textMuted',
  }[direction];

  return (
    <div className="w-full flex justify-center">
      <div className="flex items-center gap-2">
        <span className={`text-3xl sm:text-4xl font-mono text-textMain price-flash ${directionColor}`}>
          {price.toFixed(6)}
        </span>
        <span className="text-lg sm:text-xl text-textMuted">{symbol}</span>
        <span className={`text-xl ${directionColor}`}>{directionIcon}</span>
      </div>
    </div>
  );
};

// ==================== TokenAmountInput ====================

interface TokenAmountInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  symbol: string;
  maxAmount?: number;
  onMax?: () => void;
  usdEstimate?: number;
  error?: string;
  disabled?: boolean;
}

export const TokenAmountInput: React.FC<TokenAmountInputProps> = ({
  label,
  value,
  onChange,
  symbol,
  maxAmount,
  onMax,
  usdEstimate,
  error,
  disabled = false,
}) => {
  return (
    <div className="bg-surface border border-borderInner rounded-xl p-4 min-h-[80px]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-textMuted text-xs uppercase">{label}</span>
        {onMax && maxAmount !== undefined && (
          <button
            onClick={onMax}
            disabled={disabled}
            className="text-primary text-xs font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            MAX
          </button>
        )}
      </div>

      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="text-2xl sm:text-3xl font-mono text-textMain w-full bg-transparent border-none focus:outline-none disabled:opacity-50"
        placeholder="0.00"
      />

      <div className="flex justify-between items-center mt-2">
        <span className="bg-borderInner rounded-md px-2 py-1 text-xs font-medium text-textMain">
          {symbol}
        </span>
        {usdEstimate !== undefined && (
          <span className="text-textMuted text-xs">≈ ${usdEstimate.toFixed(2)}</span>
        )}
      </div>

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
    </div>
  );
};

// ==================== SwapArrow ====================

interface SwapArrowProps {
  onClick: () => void;
  loading?: boolean;
}

export const SwapArrow: React.FC<SwapArrowProps> = ({ onClick, loading = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-12 h-12 sm:w-10 sm:h-10 bg-surface border-2 border-borderOuter rounded-full -my-2 z-10 relative mx-auto flex items-center justify-center hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
      style={{ minHeight: '44px' }}
    >
      {loading ? (
        <LoadingSpinner size="sm" color="primary" />
      ) : (
        <FaExchangeAlt className="w-4 h-4 text-textMain transition-transform duration-300 hover:rotate-180" />
      )}
    </button>
  );
};

// ==================== PoolShareBar ====================

interface PoolShareBarProps {
  share: number;
  label?: string;
}

export const PoolShareBar: React.FC<PoolShareBarProps> = ({ share, label }) => {
  const percentage = Math.min(100, Math.max(0, share));
  const showInsideLabel = percentage > 15;

  return (
    <div className="w-full">
      <div className="h-3 bg-borderInner rounded-full overflow-hidden">
        <div
          className="h-full bg-poolBlue rounded-full transition-all duration-700 flex items-center justify-center"
          style={{ width: `${percentage}%` }}
        >
          {showInsideLabel && (
            <span className="text-xs text-white font-medium">{percentage.toFixed(1)}%</span>
          )}
        </div>
      </div>
      {!showInsideLabel && (
        <span className="text-xs text-textMuted mt-1 block">{percentage.toFixed(1)}%</span>
      )}
      {label && <span className="text-xs text-textMuted ml-2">{label}</span>}
    </div>
  );
};

// ==================== StatCard ====================

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  icon,
  trend = 'neutral',
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-surface border border-borderInner rounded-xl p-4 sm:p-5">
        <SkeletonLoader height="h-8" width="w-24" />
      </div>
    );
  }

  const trendIcon = {
    up: '↑',
    down: '↓',
    neutral: '—',
  }[trend];

  const trendColor = {
    up: 'text-swapGreen',
    down: 'text-error',
    neutral: 'text-textMuted',
  }[trend];

  return (
    <div className="bg-surface border border-borderInner rounded-xl p-4 sm:p-5 w-full">
      <div className="flex items-start justify-between mb-2">
        <span className="text-textMuted text-xs uppercase">{label}</span>
        {icon && <div className="text-textMuted">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl sm:text-2xl font-mono text-textMain">{value}</span>
        {trend !== 'neutral' && <span className={`text-sm ${trendColor}`}>{trendIcon}</span>}
      </div>
      {subValue && <span className="text-xs text-textMuted mt-1 block">{subValue}</span>}
    </div>
  );
};

// ==================== Alert ====================

interface AlertProps {
  variant?: 'info' | 'success' | 'error' | 'warning';
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
}) => {
  const variantClasses = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-[#FEF3C7] border-[#FDE68A] text-[#7C4A00]',
  };

  return (
    <div className={`border rounded-lg p-4 ${variantClasses[variant]} relative`}>
      {dismissible && (
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 text-current opacity-70 hover:opacity-100 min-h-[44px] flex items-center"
        >
          ×
        </button>
      )}
      {title && <h4 className="font-semibold mb-1">{title}</h4>}
      <div className="text-sm">{children}</div>
    </div>
  );
};

// ==================== Input ====================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm text-textMuted mb-1">{label}</label>
      )}
      <input
        className={`w-full px-4 py-3 bg-surface border border-borderInner rounded-lg text-textMain focus:outline-none focus:border-primary disabled:opacity-50 min-h-[44px] ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

// ==================== Button ====================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary/90',
    secondary: 'bg-surface text-textMain border border-borderInner hover:bg-borderInner',
    outline: 'bg-transparent text-primary border border-primary hover:bg-primary/10',
    ghost: 'bg-transparent text-textMain hover:bg-borderInner',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm min-h-[36px]',
    md: 'px-4 py-3 text-base min-h-[44px]',
    lg: 'px-6 py-4 text-lg min-h-[52px]',
  };

  return (
    <button
      className={`rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      style={{ minHeight: '44px' }}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" color={variant === 'primary' ? 'white' : 'primary'} />}
      {!loading && icon && <span>{icon}</span>}
      {children}
    </button>
  );
};

// ==================== Card ====================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md' }) => {
  const paddingClasses = {
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6',
  };

  return (
    <div className={`bg-surface border border-borderInner rounded-xl ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
};

// ==================== EmptyState ====================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="text-textMuted mb-4 text-4xl">{icon}</div>}
      <h3 className="text-lg font-semibold text-textMain mb-2">{title}</h3>
      {description && <p className="text-textMuted text-sm mb-4 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

// ==================== SkeletonLoader ====================

interface SkeletonLoaderProps {
  height?: string;
  width?: string;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  height = 'h-4',
  width = 'w-full',
  className = '',
}) => {
  return (
    <div
      className={`animate-pulse bg-borderInner rounded ${height} ${width} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
};
