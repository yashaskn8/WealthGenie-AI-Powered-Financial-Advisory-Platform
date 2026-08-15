import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

/**
 * Shared loading/error/empty state components for consistent UX across all screens.
 * Uses design tokens from styles/tokens.css.
 */

const baseCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-12) var(--space-8)',
  borderRadius: 'var(--radius-lg)',
  textAlign: 'center',
  minHeight: 220,
  gap: 'var(--space-4)',
};

/**
 * Loading spinner with optional message.
 * @param {{ message?: string, size?: 'sm'|'md'|'lg' }} props
 */
export const LoadingState = ({ message = 'Loading...', size = 'md' }) => {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 48 : 36;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        ...baseCardStyle,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
      }}
      role="status"
      aria-label={message}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 size={iconSize} color="var(--color-primary)" />
      </motion.div>
      <p style={{
        color: 'var(--text-muted)',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-medium)',
        margin: 0,
      }}>
        {message}
      </p>
    </motion.div>
  );
};

/**
 * Error display with optional retry action.
 * @param {{ message?: string, onRetry?: () => void }} props
 */
export const ErrorState = ({ message = 'Something went wrong.', onRetry }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    style={{
      ...baseCardStyle,
      background: 'var(--color-error-bg)',
      border: '1px solid var(--color-error-border)',
    }}
    role="alert"
  >
    <AlertCircle size={36} color="var(--color-error)" />
    <p style={{
      color: 'var(--color-error-light)',
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--font-medium)',
      margin: 0,
      maxWidth: 400,
      lineHeight: 'var(--leading-relaxed)',
    }}>
      {message}
    </p>
    {onRetry && (
      <button
        onClick={onRetry}
        aria-label="Retry"
        style={{
          marginTop: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-6)',
          background: 'var(--color-error)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-semibold)',
          cursor: 'pointer',
          transition: 'opacity var(--duration-fast)',
        }}
      >
        Try Again
      </button>
    )}
  </motion.div>
);

/**
 * Empty / no-data placeholder with optional call-to-action.
 * @param {{ message?: string, actionLabel?: string, onAction?: () => void, icon?: React.ReactNode }} props
 */
export const EmptyState = ({ message = 'Nothing here yet.', actionLabel, onAction, icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    style={{
      ...baseCardStyle,
      background: 'var(--surface-card)',
      border: '1px dashed var(--border-default)',
    }}
    role="status"
  >
    {icon || <Inbox size={36} color="var(--text-dim)" />}
    <p style={{
      color: 'var(--text-muted)',
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--font-medium)',
      margin: 0,
      maxWidth: 400,
      lineHeight: 'var(--leading-relaxed)',
    }}>
      {message}
    </p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        style={{
          marginTop: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-6)',
          background: 'var(--color-primary-bg)',
          color: 'var(--color-primary)',
          border: '1px solid var(--color-primary-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-semibold)',
          cursor: 'pointer',
          transition: 'all var(--duration-fast)',
        }}
      >
        {actionLabel}
      </button>
    )}
  </motion.div>
);

export default { LoadingState, ErrorState, EmptyState };
