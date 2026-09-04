import { formatPaise } from "../api.js";
import type { Product } from "../types.js";

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="rating" aria-label={`Rated ${rating} out of 5`}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 1.6l2.4 5 5.5.8-4 3.9.95 5.5L10 14.2l-4.9 2.6.95-5.5-4-3.9 5.5-.8z" />
      </svg>
      {rating.toFixed(1)}
    </span>
  );
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  return (
    <article className="card">
      <div className="card-image">
        {/* The container owns the aspect ratio, so the grid never reflows as
            photographs arrive. alt is empty because the product name sits
            directly beneath: announcing it twice is noise to a screen reader. */}
        <img src={product.image_url} alt="" loading="lazy" decoding="async" />
        <span className="card-category">{product.category}</span>
      </div>

      <div className="card-body">
        <h3 className="card-name">{product.name}</h3>
        <p className="card-description">{product.description}</p>

        <div className="card-meta">
          <span className="card-merchant">{product.merchant_id}</span>
          {typeof product.rating === "number" ? <Stars rating={product.rating} /> : null}
        </div>

        <div className="card-foot">
          <span className="card-price">{formatPaise(product.price_paise)}</span>
          <button className="btn btn-add" type="button" onClick={() => onAdd(product)}>
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
