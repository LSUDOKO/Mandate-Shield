import catalogData from "../../../packages/agent/src/mockCatalog.json";
import type { Health, Product, TransactionRecord } from "./types.js";

/**
 * The catalog ships with the storefront.
 *
 * It is the same file the agent reads, imported rather than fetched, because
 * the API deliberately exposes no product listing endpoint: catalog data is
 * untrusted input to the verifier, and giving it a privileged route into the
 * server would blur exactly the boundary Check 3 exists to hold.
 */
export const CATALOG: Product[] = catalogData as Product[];

export const CATEGORIES = ["footwear", "apparel", "electronics", "fitness", "accessories"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Where the API lives. Empty in development, where Vite proxies /api to the
 * server; set at build time when the two are hosted separately.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

/**
 * Turns a chosen product into the instruction the shield will judge.
 *
 * This is the whole authorization record, so it says only what the shopper
 * actually settled by clicking: this product, from this merchant, at a ceiling
 * they can see on the checkout screen before they commit. Nothing here is
 * invented on the shopper's behalf, which is why a legitimate cart passes Check
 * 2 and a poisoned listing still fails Check 3.
 */
export function buildInstruction(product: Product, ceilingPaise: number): string {
  const ceilingRupees = Math.ceil(ceilingPaise / 100);
  return `buy the ${product.name} from ${product.merchant_id} under ${ceilingRupees} INR`;
}

export const api = {
  health: () => json<Health>("/api/health"),
  checkout: (instruction: string) =>
    json<TransactionRecord>("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction }),
    }),
};

/** 289900 -> "₹2,899.00", matching the server's own formatting. */
export function formatPaise(paise: number): string {
  const rupees = Math.trunc(Math.abs(paise) / 100);
  const fraction = String(Math.abs(paise) % 100).padStart(2, "0");
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${paise < 0 ? "-" : ""}₹${grouped}.${fraction}`;
}

export function shortHash(hash: string): string {
  const bare = hash.replace(/^sha256:/, "");
  return `${bare.slice(0, 10)}…${bare.slice(-6)}`;
}
