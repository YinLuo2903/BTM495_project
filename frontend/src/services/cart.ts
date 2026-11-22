import { sessionApi } from "./session";

export interface CartLine {
  item_id: number;
  name: string;
  category: string;
  /** Unit price saved when the item was added. */
  price: number;
  quantity: number;
  subtotal: number;
  /** null when stock is not tracked. */
  stock_quantity: number | null;
}

export interface CartSummary {
  items: CartLine[];
  /** Total quantity across all lines; shown as the nav badge. */
  count: number;
  total: number;
}

/** Fired on window after the cart changes; `detail` is the new CartSummary. */
export const CART_CHANGE_EVENT = "lpvr-cart-change";

export function announceCart(summary: CartSummary): void {
  window.dispatchEvent(new CustomEvent<CartSummary>(CART_CHANGE_EVENT, { detail: summary }));
}

/** The signed-in customer's cart; throws SessionApiError (signedOut) for guests. */
export async function fetchCart(): Promise<CartSummary> {
  const { items, count, total } = await sessionApi<CartSummary>("/api/my-cart");
  return { items, count, total };
}

/**
 * Add to the signed-in customer's cart. Throws SessionApiError: signedOut for guests,
 * status 409 when the item is out of stock or the cart already holds all of it.
 */
export async function addToCart(itemId: number, quantity = 1): Promise<CartSummary & { message: string }> {
  const result = await sessionApi<CartSummary & { message: string }>("/api/my-cart", "POST", { item_id: itemId, quantity });
  announceCart(result);
  return result;
}

/** Map of item_id → quantity already in the cart. */
export function quantities(summary: CartSummary): Record<number, number> {
  return Object.fromEntries(summary.items.map(line => [line.item_id, line.quantity]));
}
