'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/utils';
import { PhotocopyButton } from './photocopy-button';

interface SelectionBarProps {
  selectedMedia: unknown[];
  onPhotocopy: () => void;
  loading?: boolean;
  className?: string;
}

const SelectionBar = React.forwardRef<HTMLDivElement, SelectionBarProps>(
  ({ selectedMedia, onPhotocopy, loading, className }, ref) => {
    const count = selectedMedia.length;

    return (
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cn(
              'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
              'flex items-center gap-4 px-5 py-3 rounded-2xl',
              'bg-[#151517] border border-[#262629]',
              'backdrop-blur-xl shadow-2xl',
              className
            )}
          >
            <span className="text-sm font-medium text-white/80 whitespace-nowrap">
              <span className="font-bold text-white">{count}</span>{' '}
              seleccionado{count === 1 ? '' : 's'}
            </span>
            <div className="w-px h-8 bg-white/10" />
            <PhotocopyButton
              label="Photocopy"
              totalJobs={count}
              onClick={onPhotocopy}
              loading={loading}
            />
          </motion.div>
        )}
      </AnimatePresence>
    )
  }
);
SelectionBar.displayName = 'SelectionBar';

export { SelectionBar };