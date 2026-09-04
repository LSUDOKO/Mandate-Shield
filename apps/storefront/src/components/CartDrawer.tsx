import { formatPaise } from "../api.js";
import type { CartLine } from "../types.js";

interface CartDrawerProps {
  open: boolean;
  lines: CartLine[];
  onClose: () => void;
  onQty: (sku: string, delta: number) => void;
  onRemove: (sku: string) => void;
  onCheckout: () => void;
}

export function CartDrawer({ open, lines, onClose, onQty, onRemove, onCheckout }: CartDrawerProps) {
  const total = lines.reduce((sum, line) => sum + line.product.price_paise * line.qty, 0);
  const merchants = new Set(lines.map((line) => line.product.merchant_id));

  return (
    <>
      <div className={`scrim ${open ? "scrim-on" : ""}`} onClick={onClose} aria-hidden="true" />

      <aside className={`drawer ${open ? "drawer-on" : ""}`} aria-label="Cart" aria-hidden={!open}>
        <div className="drawer-head">
          <h2>Your cart</h2>
          <button className="icon-btn" onClick={onClose} type="button" aria-label="Close cart">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="drawer-empty">
            <p>Your cart is empty.</p>
            <button className="btn btn-quiet" onClick={onClose} type="button">
              Browse products
            </button>
          </div>
        ) : (
          <>
            <div className="drawer-lines">
              {lines.map(({ product, qty }) => (
                <div className="line" key={product.sku}>
                  <img className="line-image" src={product.image_url} alt="" />

                  <div className="line-body">
                    <p className="line-name">{product.name}</p>
                    <p className="line-merchant">{product.merchant_id}</p>

                    <div className="qty">
                      <button onClick={() => onQty(product.sku, -1)} type="button" aria-label="Decrease quantity">
                        −
                      </button>
                      <span>{qty}</span>
                      <button onClick={() => onQty(product.sku, 1)} type="button" aria-label="Increase quantity">
                        +
                      </button>
                    </div>
                  </div>

                  <div className="line-right">
                    <span className="line-price">{formatPaise(product.price_paise * qty)}</span>
                    <button className="line-remove" onClick={() => onRemove(product.sku)} type="button">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="drawer-foot">
              <div className="drawer-total">
                <span>Total</span>
                <strong>{formatPaise(total)}</strong>
              </div>

              {merchants.size > 1 ? (
                <p className="drawer-note">
                  {merchants.size} merchants in this cart. Each is authorized separately, so you will
                  see one verification per merchant.
                </p>
              ) : null}

              <button className="btn btn-primary btn-block" onClick={onCheckout} type="button">
                Proceed to checkout
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
