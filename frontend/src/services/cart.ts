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
  /** Item photo ("/uploads/<hex>.webp"); missing or null shows a placeholder. */
  image_path?: string | null;
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

/** Set a cart line's quantity; throws SessionApiError (409 above stock, 404 not in cart). */
export async function updateCartQuantity(itemId: number, quantity: number): Promise<CartSummary & { message: string }> {
  const result = await sessionApi<CartSummary & { message: string }>(`/api/my-cart/${itemId}`, "PATCH", { quantity });
  announceCart(result);
  return result;
}

/** Remove a cart line; throws SessionApiError (404 when it is not in the cart). */
export async function removeFromCart(itemId: number): Promise<CartSummary & { message: string }> {
  const result = await sessionApi<CartSummary & { message: string }>(`/api/my-cart/${itemId}`, "DELETE");
  announceCart(result);
  return result;
}

export interface PaidOrder {
  order_id: number;
  total: number;
  /** "YYYY-MM-DD HH:MM:SS" */
  paid_at: string;
  card_last4: string;
}

/**
 * Pay for the selected cart lines with the mock card gateway. On success the
 * paid lines leave the cart (announced to the nav). Throws SessionApiError:
 * 400 invalid card details, 402 declined, 409 the cart changed.
 */
export async function payForItems(itemIds: number[], card: { cardholder_name: string; card_number: string; expiration_date: string; cvv: string }): Promise<PaidOrder> {
  const result = await sessionApi<CartSummary & { order: PaidOrder }>("/api/my-checkout", "POST", { item_ids: itemIds, ...card });
  announceCart(result);
  return result.order;
}

const UNSELECTED_KEY = "lpvr.cart.unselected";

/**
 * Item ids the customer unticked in the shopping cart. Unselected (rather than
 * selected) ids are stored so newly added items start out selected. Browser-only:
 * storage may be unavailable, in which case everything counts as selected.
 */
export function readUnselected(): Set<number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(UNSELECTED_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id)) : []);
  } catch {
    return new Set();
  }
}

export function saveUnselected(ids: Set<number>): void {
  try {
    if (ids.size) localStorage.setItem(UNSELECTED_KEY, JSON.stringify([...ids]));
    else localStorage.removeItem(UNSELECTED_KEY);
  } catch {
    // Selection is a convenience; keep working without storage.
  }
}

/** Map of item_id → quantity already in the cart. */
export function quantities(summary: CartSummary): Record<number, number> {
  return Object.fromEntries(summary.items.map(line => [line.item_id, line.quantity]));
}
