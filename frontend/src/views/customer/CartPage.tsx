import { useEffect, useState } from "react";
import { errorMessage, formatAmount } from "../../services/api";
import { CART_CHANGE_EVENT, fetchCart, type CartSummary } from "../../services/cart";
import { SessionApiError } from "../../services/session";
import { ItemImage } from "./addToCart";

type State =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error"; message: string }
  | { kind: "ready"; cart: CartSummary };

const plural = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

/** cart.html: what the signed-in customer has added from the items pages. */
export function CartPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetchCart()
      .then(cart => { if (active) setState({ kind: "ready", cart }); })
      .catch(reason => {
        if (!active) return;
        setState(reason instanceof SessionApiError && reason.signedOut ? { kind: "guest" } : { kind: "error", message: errorMessage(reason) });
      });
    // Stay current if the cart changes elsewhere on the page.
    const onChange = (event: Event) => setState({ kind: "ready", cart: (event as CustomEvent<CartSummary>).detail });
    window.addEventListener(CART_CHANGE_EVENT, onChange);
    return () => { active = false; window.removeEventListener(CART_CHANGE_EVENT, onChange); };
  }, []);

  return <div className="ev-page it-page">
    <header className="ev-header">
      <h1>Shopping Cart</h1>
      <p>Review the items you have added before checkout.</p>
    </header>

    {state.kind === "loading" ? <section className="ev-card it-detail-notice"><p role="status">Loading your shopping cart…</p></section>
    : state.kind === "guest" ? <section className="ev-card it-empty">
      <h2>Sign in to see your shopping cart</h2>
      <p>Your shopping cart is saved to your customer account.</p>
      <p><a href="login.html">Sign in</a> or <a href="signup.html">create an account</a>.</p>
    </section>
    : state.kind === "error" ? <section className="ev-card it-detail-notice"><p className="ev-alert" role="alert">Could not load your shopping cart: {state.message}</p></section>
    : !state.cart.items.length ? <section className="ev-card it-empty">
      <h2>Your shopping cart is empty</h2>
      <p>Browse bike parts and accessories, then add them to your cart.</p>
      <p><a href="items.html">Browse items</a></p>
    </section>
    : <div className="it-cart">
      <section className="ev-card it-card" aria-label="Items in your shopping cart">
        <ul className="it-list">{state.cart.items.map(line => <li key={line.item_id} className="it-row it-cart-row">
          <ItemImage />
          <div className="it-info">
            <h2 className="it-name"><a href={`item.html?id=${line.item_id}`}>{line.name}</a></h2>
            <p className="it-meta">
              <span>Qty {line.quantity} × {formatAmount(line.price)}</span>
              {line.category && <><span aria-hidden="true">·</span><span>{line.category}</span></>}
            </p>
          </div>
          <p className="it-price">{formatAmount(line.subtotal)}</p>
        </li>)}</ul>
      </section>
      <aside className="ev-card it-cart-summary" aria-label="Order summary">
        <h2>Order summary</h2>
        <dl>
          <div><dt>Items</dt><dd>{plural(state.cart.count)}</dd></div>
          <div className="it-cart-total"><dt>Total</dt><dd>{formatAmount(state.cart.total)}</dd></div>
        </dl>
        <button type="button" className="it-add" disabled>Checkout</button>
        <p className="ev-muted it-small">Checkout is not available yet. <a href="checkout.html">View checkout page</a></p>
        <p className="it-small"><a href="items.html">Continue shopping</a></p>
      </aside>
    </div>}
  </div>;
}
