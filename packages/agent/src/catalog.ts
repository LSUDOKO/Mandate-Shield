import catalogData from "./mockCatalog.json" with { type: "json" };

export interface CatalogProduct {
  sku: string;
  name: string;
  merchant_id: string;
  price_paise: number;
  category: string;
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
}

/** Plain filtering. No model involved — the LLM only chooses among these results. */
export function searchCatalog(query: CatalogQuery, catalog: CatalogProduct[] = MOCK_CATALOG): CatalogProduct[] {
  const { max_amount_paise, merchant_id, item_category } = query.constraints;
  return catalog.filter((product) => {
    if (typeof max_amount_paise === "number" && product.price_paise > max_amount_paise) return false;
    if (merchant_id && product.merchant_id !== merchant_id) return false;
    if (item_category && product.category !== item_category) return false;
    return true;
  });
}
