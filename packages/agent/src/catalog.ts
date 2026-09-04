import catalogData from "./mockCatalog.json" with { type: "json" };

export interface CatalogProduct {
  sku: string;
  name: string;
  merchant_id: string;
  price_paise: number;
  category: string;
  /**
   * Presentation-only fields. The verifier never reads them: catalog text is
   * data, and only sku, name, unit_price_paise and qty may reach a cart at all.
   * A poisoned listing therefore carries its authorization claim in `name`,
   * which is the field Check 3 actually scans.
   */
  description?: string;
  image_url?: string;
  rating?: number;
  in_stock?: boolean;
  /** Marks deliberately hostile fixtures used to exercise Check 3. */
  poisoned?: boolean;
}

export const MOCK_CATALOG: CatalogProduct[] = catalogData as CatalogProduct[];

export interface CatalogQuery {
  constraints: {
    max_amount_paise?: number;
    merchant_id?: string;
    item_category?: string;
  };
  /** Free text from the instruction, used to match a product the user named. */
  query_text?: string;
}

/**
 * Ranks products a user asking for a named item would plausibly get back.
 *
 * Scoring is only about relevance — it deliberately does not treat a poisoned
 * listing as less relevant. Filtering hostile catalog text here would hide the
 * attack from Check 3, which is the component whose job it is to catch it.
 */
function nameScore(product: CatalogProduct, queryText: string): number {
  const haystack = `${product.name} ${product.sku}`.toLowerCase();
  const words = queryText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

  if (words.length === 0) return 0;
  return words.reduce((score, word) => (haystack.includes(word) ? score + 1 : score), 0);
}

const STOPWORDS = new Set([
  "buy", "the", "for", "from", "under", "below", "with", "and", "get", "please",
  "inr", "rupees", "budget", "max", "maximum", "cap", "upto", "purchase", "order",
]);

/** Plain filtering and ranking. No model involved — the LLM only chooses among these results. */
export function searchCatalog(
  query: CatalogQuery,
  catalog: CatalogProduct[] = MOCK_CATALOG,
): CatalogProduct[] {
  const { max_amount_paise, merchant_id, item_category } = query.constraints;

  const eligible = catalog.filter((product) => {
    if (typeof max_amount_paise === "number" && product.price_paise > max_amount_paise) return false;
    if (merchant_id && product.merchant_id !== merchant_id) return false;
    if (item_category && product.category !== item_category) return false;
    return true;
  });

  if (!query.query_text) return eligible;

  // A product the user named by name should come first; ties keep catalog order.
  const scored = eligible.map((product, index) => ({
    product,
    score: nameScore(product, query.query_text as string),
    index,
  }));

  if (scored.every((entry) => entry.score === 0)) return eligible;

  return scored
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.product);
}
