import { CATEGORIES, type Category } from "../api.js";
import type { Product } from "../types.js";
import { ProductCard } from "./ProductCard.js";

interface ProductGridProps {
  products: Product[];
  category: Category | "all";
  onCategory: (category: Category | "all") => void;
  onAdd: (product: Product) => void;
}

export function ProductGrid({ products, category, onCategory, onAdd }: ProductGridProps) {
  const visible = category === "all" ? products : products.filter((p) => p.category === category);

  return (
    <>
      <section className="hero">
        <p className="hero-eyebrow">Secured by Mandate Shield</p>
        <h1 className="hero-title">
          A valid signature does not
          <br />
          mean a valid payment.
        </h1>
        <p className="hero-copy">
          Every checkout here runs through five deterministic checks before the payment mandate is
          signed. No model decides whether your money moves.
        </p>
      </section>

      <nav className="filters" aria-label="Filter by category">
        <button
          className={`filter ${category === "all" ? "filter-on" : ""}`}
          onClick={() => onCategory("all")}
          type="button"
        >
          All
          <span className="filter-count">{products.length}</span>
        </button>

        {CATEGORIES.map((name) => {
          const count = products.filter((p) => p.category === name).length;
          return (
            <button
              key={name}
              className={`filter ${category === name ? "filter-on" : ""}`}
              onClick={() => onCategory(name)}
              type="button"
            >
              {name}
              <span className="filter-count">{count}</span>
            </button>
          );
        })}
      </nav>

      <div className="grid">
        {visible.map((product) => (
          <ProductCard key={product.sku} product={product} onAdd={onAdd} />
        ))}
      </div>
    </>
  );
}
