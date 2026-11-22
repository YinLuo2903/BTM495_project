import { useEffect, useRef, useState } from "react";
import { errorMessage, type Item } from "../../services/api";
import { addToCart, fetchCart, quantities } from "../../services/cart";
import { SessionApiError } from "../../services/session";

/** At or below this many in stock, items say "Only N left". */
const LOW_STOCK = 5;
const ADDED_MS = 2000;
const TOAST_MS = 3500;

export type Toast = { kind: "success" | "error"; message: string; link?: { href: string; label: string } };
export type Stock = { label: string; tone: "in" | "low" | "out" };

export function stockStatus(stock: number | null): Stock {
  if (stock === null) return { label: "In stock", tone: "in" }; // stock not tracked
  if (stock <= 0) return { label: "Out of stock", tone: "out" };
  if (stock <= LOW_STOCK) return { label: `Only ${stock} left`, tone: "low" };
  return { label: `${stock} in stock`, tone: "in" };
}

/** Cart state and the add action shared by the items list and the item detail page. */
export function useAddToCart() {
  const [inCart, setInCart] = useState<Record<number, number>>({});
  const [adding, setAdding] = useState<number | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timers = useRef<{ added?: ReturnType<typeof setTimeout>; toast?: ReturnType<typeof setTimeout> }>({});
  // Synchronous guard: two clicks in one tick both see the old `adding` state.
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    // Guests simply have no cart yet; other failures only affect the stock-limit hint.
    fetchCart().then(cart => { if (active) setInCart(quantities(cart)); }).catch(() => undefined);
    return () => {
      active = false;
      clearTimeout(timers.current.added);
      clearTimeout(timers.current.toast);
    };
  }, []);

  function showToast(next: Toast) {
    clearTimeout(timers.current.toast);
    setToast(next);
    timers.current.toast = setTimeout(() => setToast(null), TOAST_MS);
  }

  async function add(item: Item) {
    if (inFlight.current) return;
    inFlight.current = true;
    setAdding(item.item_id);
    try {
      const cart = await addToCart(item.item_id);
      setInCart(quantities(cart));
      clearTimeout(timers.current.added);
      setJustAdded(item.item_id);
      timers.current.added = setTimeout(() => setJustAdded(null), ADDED_MS);
      showToast({ kind: "success", message: `${item.name} added to your shopping cart.`, link: { href: "cart.html", label: "View shopping cart" } });
    } catch (reason) {
      if (reason instanceof SessionApiError && reason.signedOut) {
        showToast({ kind: "error", message: "Sign in with a customer account to add items to your shopping cart.", link: { href: "login.html", label: "Sign in" } });
      } else {
        showToast({ kind: "error", message: errorMessage(reason) });
        // Stock may have changed; resync what the cart holds.
        fetchCart().then(cart => setInCart(quantities(cart))).catch(() => undefined);
      }
    } finally {
      inFlight.current = false;
      setAdding(null);
    }
  }

  return { inCart, adding, justAdded, toast, add };
}

export type CartActions = ReturnType<typeof useAddToCart>;

/** Orange Add to Cart button with Added / Adding / Out of stock / Max in cart states. */
export function AddToCartButton({ item, cart }: { item: Item; cart: CartActions }) {
  const stock = stockStatus(item.stock_quantity);
  const held = cart.inCart[item.item_id] ?? 0;
  const atLimit = item.stock_quantity !== null && stock.tone !== "out" && held >= item.stock_quantity;
  const added = cart.justAdded === item.item_id;
  return <button type="button" className={`it-add${added ? " it-add-added" : ""}`}
    disabled={stock.tone === "out" || atLimit || added || cart.adding !== null}
    onClick={() => void cart.add(item)}>
    {stock.tone === "out" ? "Out of stock"
      : atLimit ? "Max in cart"
      : added ? <><CheckIcon />Added</>
      : cart.adding === item.item_id ? "Adding…"
      : <><CartIcon />Add to Cart</>}
    {/* Visible label first (voice control), then which item it is for. */}
    <span className="it-sr-only">, {item.name}</span>
  </button>;
}

export function StockLabel({ stock }: { stock: number | null }) {
  const status = stockStatus(stock);
  return <span className={`it-stock it-stock-${status.tone}`}>{status.label}</span>;
}

export function CartToast({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  return <div className={`it-toast it-toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
    <span className="it-toast-mark" aria-hidden="true">{toast.kind === "success" ? <CheckIcon size={16} /> : "!"}</span>
    <span>{toast.message}</span>
    {toast.link && <a href={toast.link.href}>{toast.link.label}</a>}
  </div>;
}

/** The item's uploaded picture, or a placeholder icon when it has none. Decorative: the name is next to it. */
export function ItemImage({ size = 32, src }: { size?: number; src?: string | null }) {
  if (src) return <span className="it-thumb"><img className="it-thumb-img" src={src} alt="" /></span>;
  return <span className="it-thumb" aria-hidden="true">
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
  </span>;
}

function CartIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
}

function CheckIcon({ size = 18 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
