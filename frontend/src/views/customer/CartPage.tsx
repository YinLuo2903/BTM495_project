import { useEffect, useRef, useState } from "react";
import { errorMessage, formatAmount } from "../../services/api";
import {
  CART_CHANGE_EVENT, fetchCart, readUnselected, removeFromCart, saveUnselected, updateCartQuantity,
  type CartLine, type CartSummary,
} from "../../services/cart";
import { SessionApiError } from "../../services/session";
import { CartToast, ItemImage, type Toast } from "./addToCart";
import { CheckoutSteps } from "./CheckoutSteps";

const TOAST_MS = 3500;

type State =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error"; message: string }
  | { kind: "ready"; cart: CartSummary };

const plural = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

/** Totals for the selected lines only; cents are summed as integers to avoid float drift. */
export function selectionTotals(lines: CartLine[], unselected: Set<number>) {
  const chosen = lines.filter(line => !unselected.has(line.item_id));
  return {
    lines: chosen.length,
    count: chosen.reduce((sum, line) => sum + line.quantity, 0),
    total: chosen.reduce((sum, line) => sum + Math.round(line.subtotal * 100), 0) / 100,
  };
}

/** cart.html: the signed-in customer's cart, with selection, quantities and removal. */
export function CartPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [unselected, setUnselected] = useState<Set<number>>(() => readUnselected());
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const selectAll = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchCart()
      .then(cart => { if (active) setState({ kind: "ready", cart }); })
      .catch(reason => {
        if (!active) return;
        setState(reason instanceof SessionApiError && reason.signedOut ? { kind: "guest" } : { kind: "error", message: errorMessage(reason) });
      });
    // Stay current when the cart changes (this page's own updates included).
    const onChange = (event: Event) => setState({ kind: "ready", cart: (event as CustomEvent<CartSummary>).detail });
    window.addEventListener(CART_CHANGE_EVENT, onChange);
    return () => { active = false; window.removeEventListener(CART_CHANGE_EVENT, onChange); clearTimeout(toastTimer.current); };
  }, []);

  const lines = state.kind === "ready" ? state.cart.items : [];
  // Forget selections for items that are no longer in the cart.
  const known = new Set(lines.map(line => line.item_id));
  const unticked = new Set([...unselected].filter(id => known.has(id)));
  const totals = selectionTotals(lines, unticked);
  const allSelected = lines.length > 0 && totals.lines === lines.length;

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = totals.lines > 0 && !allSelected;
  });

  function updateSelection(next: Set<number>) {
    setUnselected(next);
    saveUnselected(next);
  }

  function toggle(id: number) {
    const next = new Set(unticked);
    if (next.has(id)) next.delete(id); else next.add(id);
    updateSelection(next);
  }

  function showToast(next: Toast) {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  async function change(line: CartLine, action: "remove" | number) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(line.item_id);
    try {
      if (action === "remove") {
        await removeFromCart(line.item_id);
        showToast({ kind: "success", message: `${line.name} removed from your shopping cart.` });
      } else {
        await updateCartQuantity(line.item_id, action);
      }
    } catch (reason) {
      if (reason instanceof SessionApiError && reason.signedOut) {
        setState({ kind: "guest" });
        return;
      }
      showToast({ kind: "error", message: errorMessage(reason) });
      fetchCart().then(cart => setState({ kind: "ready", cart })).catch(() => undefined);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return <div className="ev-page it-page">
    <header className="ev-header">
      <h1>Shopping Cart</h1>
      <p>Review the items you have added before checkout.</p>
    </header>
    <CheckoutSteps current={1} />

    {state.kind === "loading" ? <section className="ev-card it-detail-notice"><p role="status">Loading your shopping cart…</p></section>
    : state.kind === "guest" ? <section className="ev-card it-empty">
      <h2>Sign in to see your shopping cart</h2>
      <p>Your shopping cart is saved to your customer account.</p>
      <p><a href="login.html">Sign in</a> or <a href="signup.html">create an account</a>.</p>
    </section>
    : state.kind === "error" ? <section className="ev-card it-detail-notice"><p className="ev-alert" role="alert">Could not load your shopping cart: {state.message}</p></section>
    : !lines.length ? <section className="ev-card it-empty">
      <h2>Your shopping cart is empty</h2>
      <p>Browse bike parts and accessories, then add them to your cart.</p>
      <p><a href="items.html">Browse items</a></p>
    </section>
    : <div className="it-cart">
      <section className="ev-card it-card" aria-label="Items in your shopping cart">
        <div className="it-select-bar">
          <label className="it-check">
            <input ref={selectAll} type="checkbox" checked={allSelected}
              onChange={() => updateSelection(allSelected ? new Set(known) : new Set())} />
            <span className="it-select-label">Select all</span>
          </label>
        </div>
        <ul className="it-list">{lines.map(line => {
          const selected = !unticked.has(line.item_id);
          const rowBusy = busy === line.item_id;
          const atMax = line.stock_quantity !== null && line.quantity >= line.stock_quantity;
          return <li key={line.item_id} className={`it-row it-cart-row${selected ? "" : " it-cart-row-off"}`} aria-busy={rowBusy || undefined}>
            <input type="checkbox" className="it-cart-select" checked={selected} onChange={() => toggle(line.item_id)}
              aria-label={`Select ${line.name}`} />
            <ItemImage src={line.image_path} />
            <div className="it-info">
              <h2 className="it-name"><a href={`item.html?id=${line.item_id}`}>{line.name}</a></h2>
              {line.category && <p className="it-meta">{line.category}</p>}
            </div>
            <div className="it-stepper" role="group" aria-label={`Quantity, ${line.name}`}>
              <button type="button" aria-label={`Decrease quantity, ${line.name}`} disabled={line.quantity <= 1 || busy !== null}
                onClick={() => void change(line, line.quantity - 1)}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
              </button>
              <output aria-live="polite">{line.quantity}</output>
              <button type="button" aria-label={`Increase quantity, ${line.name}`} disabled={atMax || busy !== null}
                title={atMax ? "Maximum available quantity" : undefined}
                onClick={() => void change(line, line.quantity + 1)}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            <p className="it-price it-line-total">{formatAmount(line.subtotal)}</p>
            <button type="button" className="it-remove" disabled={busy !== null} onClick={() => void change(line, "remove")}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
              Remove<span className="it-sr-only">, {line.name}</span>
            </button>
          </li>;
        })}</ul>
      </section>
      <aside className="ev-card it-cart-summary" aria-label="Order summary">
        <h2>Order summary</h2>
        <dl>
          <div><dt>Selected items</dt><dd>{plural(totals.count)}</dd></div>
          <div className="it-cart-total"><dt>Total</dt><dd>{formatAmount(totals.total)}</dd></div>
        </dl>
        {totals.lines > 0
          ? <a className="it-add it-checkout" href="checkout.html">Checkout ({plural(totals.count)})</a>
          : <button type="button" className="it-add" disabled>Select items to check out</button>}
        <p className="ev-muted it-small">Only selected items are checked out. Unselected items stay in your cart.</p>
        <p className="it-small"><a href="items.html">Continue shopping</a></p>
      </aside>
    </div>}
    <CartToast toast={toast} />
  </div>;
}
