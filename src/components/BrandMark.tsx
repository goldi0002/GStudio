import React from 'react';

interface BrandMarkProps {
  size?: 'sm' | 'md';
  showSubtitle?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 'sm',
  showSubtitle = false,
}) => {
  const iconBox = size === 'md' ? 'w-9 h-9 rounded-[9px]' : 'w-6 h-6 rounded-[6px]';

  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <div
        className={`${iconBox} relative flex items-center justify-center shadow-sm overflow-hidden shrink-0`}
        style={{
          background: 'linear-gradient(145deg, #3298FF 0%, #0A84FF 48%, #5E5CE6 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), 0 1px 3px rgba(0,0,0,0.3)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5'}
          aria-hidden="true"
        >
          <path
            d="M12 3.75L4.5 7.75L12 11.75L19.5 7.75L12 3.75Z"
            fill="white"
            fillOpacity="0.96"
          />
          <path
            d="M4.5 12L12 16L19.5 12"
            stroke="white"
            strokeOpacity="0.88"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.5 16.25L12 20.25L19.5 16.25"
            stroke="white"
            strokeOpacity="0.62"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="leading-none">
        <div
          className={`${
            size === 'md' ? 'text-[15px]' : 'text-[13px]'
          } font-semibold tracking-[-0.02em] whitespace-nowrap`}
        >
          <span className="text-[var(--lp-text)]">G</span>
          <span className="text-[var(--lp-text)] font-medium">Studio</span>
        </div>
        {showSubtitle && (
          <p className="text-[11px] text-[var(--lp-text-secondary)] mt-0.5 whitespace-nowrap">
            Local Creative Image Editor
          </p>
        )}
      </div>
    </div>
  );
};
