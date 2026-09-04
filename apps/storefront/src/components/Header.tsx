import type { Health } from "../types.js";

interface HeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  health: Health | null;
  onHome: () => void;
}

/** The gate mark: two posts with a gap the payment passes through. */
function GateMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="7" y="7" width="4" height="18" rx="1" />
      <rect x="21" y="7" width="4" height="18" rx="1" />
    </svg>
  );
}

export function Header({ cartCount, onOpenCart, health, onHome }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" onClick={onHome} type="button">
          <GateMark />
          <span className="brand-name">Mandate Shield Store</span>
        </button>

        <div className="header-right">
          {health ? (
            <span className="modes" title="Which components are live and which are running offline.">
              <span className="mode-chip">agent {health.agent_mode}</span>
              <span className="mode-chip">gateway {health.gateway_mode}</span>
            </span>
          ) : (
            <span className="modes">
              <span className="mode-chip mode-chip-idle">connecting</span>
            </span>
          )}

          <button className="cart-button" onClick={onOpenCart} type="button" aria-label="Open cart">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.55L20.5 8H6.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="20" r="1.4" />
              <circle cx="17" cy="20" r="1.4" />
            </svg>
            <span className="cart-count">{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
