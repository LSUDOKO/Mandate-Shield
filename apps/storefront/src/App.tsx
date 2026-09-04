import { useCallback, useEffect, useState } from "react";
import { api, buildInstruction, CATALOG, type Category } from "./api.js";
import type { CartLine, Health, Product, TransactionRecord } from "./types.js";
import { Header } from "./components/Header.js";
import { ProductGrid } from "./components/ProductGrid.js";
import { CartDrawer } from "./components/CartDrawer.js";
import { CheckoutView, type CheckoutLineState } from "./components/CheckoutView.js";
import { PaymentSuccess } from "./components/PaymentSuccess.js";

type Screen = "store" | "checkout" | "success";

export function App() {
  const [screen, setScreen] = useState<Screen>("store");
  const [category, setCategory] = useState<Category | "all">("all");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [states, setStates] = useState<CheckoutLineState[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((value) => {
        if (!cancelled) setHealth(value);
      })
      .catch(() => {
        // The store still browses fine without the API. Only checkout needs it,
        // and that path reports its own failure rather than guessing here.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addToCart = useCallback((product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.product.sku === product.sku);
      if (existing) {
        return current.map((line) =>
          line.product.sku === product.sku ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [...current, { product, qty: 1 }];
    });
    setCartOpen(true);
  }, []);

  const changeQty = useCallback((sku: string, delta: number) => {
    setLines((current) =>
      current
        .map((line) => (line.product.sku === sku ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    );
  }, []);

  const removeLine = useCallback((sku: string) => {
    setLines((current) => current.filter((line) => line.product.sku !== sku));
  }, []);

  /**
   * Each cart line becomes its own verified transaction.
   *
   * The API authorizes one instruction at a time, and that is the right shape
   * rather than a limitation: a cart spanning two merchants is two separate
   * authorizations, and collapsing them would let one merchant's held item
   * silently gate another's.
   */
  const checkout = useCallback(async () => {
    if (lines.length === 0) return;

    const initial: CheckoutLineState[] = lines.map((line) => ({
      line,
      // The ceiling is the item's own price: the shopper agreed to this
      // amount by clicking it, and nothing above it.
      instruction: buildInstruction(line.product, line.product.price_paise),
      status: "pending",
    }));

    setStates(initial);
    setCartOpen(false);
    setScreen("checkout");

    for (const [index, state] of initial.entries()) {
      try {
        const record = await api.checkout(state.instruction);
        setStates((current) =>
          current.map((entry, i) => (i === index ? { ...entry, status: "done", record } : entry)),
        );
      } catch (error) {
        setStates((current) =>
          current.map((entry, i) =>
            i === index
              ? {
                  ...entry,
                  status: "error",
                  error: error instanceof Error ? error.message : String(error),
                }
              : entry,
          ),
        );
      }
    }

    // Refresh so the success screen reports the chain as it stands after these
    // decisions, rather than as it stood when the page loaded.
    api.health().then(setHealth).catch(() => undefined);
  }, [lines]);

  const complete = useCallback(() => {
    setScreen("success");
    setLines([]);
  }, []);

  const backToStore = useCallback(() => {
    setScreen("store");
    setStates([]);
  }, []);

  const cartCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const records = states
    .map((state) => state.record)
    .filter((record): record is TransactionRecord => Boolean(record));

  return (
    <div className="app">
      <Header
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        health={health}
        onHome={backToStore}
      />

      <main className="main">
        {screen === "store" ? (
          <ProductGrid
            products={CATALOG}
            category={category}
            onCategory={setCategory}
            onAdd={addToCart}
          />
        ) : null}

        {screen === "checkout" ? (
          <CheckoutView states={states} onBack={backToStore} onComplete={complete} />
        ) : null}

        {screen === "success" ? (
          <PaymentSuccess
            records={records}
            chain={health?.audit_chain ?? null}
            onBack={backToStore}
          />
        ) : null}
      </main>

      <CartDrawer
        open={cartOpen}
        lines={lines}
        onClose={() => setCartOpen(false)}
        onQty={changeQty}
        onRemove={removeLine}
        onCheckout={checkout}
      />

      <footer className="footer">
        <span>Powered by Razorpay · Verified by Mandate Shield</span>
        {health ? (
          <span className="footer-modes">
            agent {health.agent_mode} · gateway {health.gateway_mode}
            {health.gateway_mode === "mock" ? " · no real money moves" : ""}
          </span>
        ) : null}
      </footer>
    </div>
  );
}
