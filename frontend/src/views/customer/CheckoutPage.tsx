import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage, formatAmount } from "../../services/api";
import { fetchCart, payForItems, readUnselected, type CartLine, type PaidOrder } from "../../services/cart";
import { SessionApiError } from "../../services/session";
import { selectionTotals } from "./CartPage";
import { CheckoutSteps } from "./CheckoutSteps";
import { digitsOnly, formatCardNumber, formatExpiry, validateCard, type CardDetails, type CardErrors } from "./checkoutValidation";

type State =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error"; message: string }
  | { kind: "ready"; lines: CartLine[]; total: number; count: number }
  | { kind: "paid"; order: PaidOrder; remaining: number };

const EMPTY_CARD: CardDetails = { cardholderName: "", cardNumber: "", expiry: "", cvc: "" };
const plural = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

/** checkout.html: pay for the items selected in the shopping cart. */
export function CheckoutPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [card, setCard] = useState<CardDetails>(EMPTY_CARD);
  const [touched, setTouched] = useState<Partial<Record<keyof CardDetails, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    fetchCart().then(cart => {
      if (!active) return;
      const unselected = readUnselected();
      const lines = cart.items.filter(line => !unselected.has(line.item_id));
      const totals = selectionTotals(lines, new Set());
      setState({ kind: "ready", lines, total: totals.total, count: totals.count });
    }).catch(reason => {
      if (!active) return;
      setState(reason instanceof SessionApiError && reason.signedOut ? { kind: "guest" } : { kind: "error", message: errorMessage(reason) });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (state.kind === "paid") resultHeading.current?.focus();
  }, [state.kind]);

  const errors: CardErrors = validateCard(card);
  const valid = Object.keys(errors).length === 0;
  const shown = (field: keyof CardDetails) => (touched[field] ? errors[field] : undefined);

  function edit(field: keyof CardDetails, value: string) {
    const formatted = field === "cardholderName" ? value.slice(0, 50)
      : field === "cardNumber" ? formatCardNumber(value)
      : field === "expiry" ? formatExpiry(value)
      : digitsOnly(value).slice(0, 3);
    setCard(previous => ({ ...previous, [field]: formatted }));
    setPayError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched({ cardholderName: true, cardNumber: true, expiry: true, cvc: true });
    if (state.kind !== "ready" || !valid || submitting) return;
    setSubmitting(true);
    setPayError("");
    try {
      const order = await payForItems(state.lines.map(line => line.item_id), {
        cardholder_name: card.cardholderName.trim(),
        card_number: digitsOnly(card.cardNumber), expiration_date: card.expiry, cvv: card.cvc,
      });
      setCard(EMPTY_CARD); // never keep card details around after paying
      const remaining = await fetchCart().then(cart => cart.count).catch(() => 0);
      setState({ kind: "paid", order, remaining });
    } catch (reason) {
      if (reason instanceof SessionApiError && reason.signedOut) setState({ kind: "guest" });
      else setPayError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="ev-page it-page">
    {state.kind !== "paid" && <>
      <p className="it-back"><a href="cart.html">← Back to shopping cart</a></p>
      <header className="ev-header">
        <h1>Checkout</h1>
        <p>Enter your card details to pay for the items you selected.</p>
      </header>
      <CheckoutSteps current={2} />
    </>}

    {state.kind === "loading" ? <section className="ev-card it-detail-notice"><p role="status">Loading your order…</p></section>
    : state.kind === "guest" ? <section className="ev-card it-empty">
      <h2>Sign in to check out</h2>
      <p><a href="login.html">Sign in</a> or <a href="signup.html">create an account</a>.</p>
    </section>
    : state.kind === "error" ? <section className="ev-card it-detail-notice"><p className="ev-alert" role="alert">Could not load your order: {state.message}</p></section>
    : state.kind === "paid" ? <section className="ev-card it-paid" aria-labelledby="it-paid-title">
      <span className="it-paid-mark" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <h1 id="it-paid-title" ref={resultHeading} tabIndex={-1}>Payment successful</h1>
      <p>Thank you! Your order has been placed.</p>
      <dl className="it-paid-details">
        <div><dt>Order number</dt><dd>#{state.order.order_id}</dd></div>
        <div><dt>Amount paid</dt><dd>{formatAmount(state.order.total)}</dd></div>
        <div><dt>Card</dt><dd>Ending in {state.order.card_last4}</dd></div>
      </dl>
      <div className="it-detail-actions">
        <a className="it-add it-link-button" href="items.html">Continue shopping</a>
        {state.remaining > 0 && <a href="cart.html">Back to shopping cart ({plural(state.remaining)})</a>}
      </div>
    </section>
    : !state.lines.length ? <section className="ev-card it-empty">
      <h2>No items selected</h2>
      <p>Select the items you want to buy in your shopping cart.</p>
      <p><a href="cart.html">Go to shopping cart</a></p>
    </section>
    : <div className="it-cart">
      <section className="ev-card it-pay" aria-labelledby="it-pay-title">
        <h2 id="it-pay-title">Payment details</h2>
        <p className="it-demo-note">Demo payment only — do not enter a real card. Use <strong>4242 4242 4242 4242</strong> to be approved; other valid numbers are declined.</p>
        <form noValidate onSubmit={submit}>
          <Field id="cardholder-name" label="Cardholder name" error={shown("cardholderName")}>
            <input id="cardholder-name" autoComplete="cc-name" placeholder="Name as it appears on the card" maxLength={50}
              value={card.cardholderName} onChange={event => edit("cardholderName", event.target.value)}
              onBlur={() => setTouched(previous => ({ ...previous, cardholderName: true }))}
              aria-invalid={Boolean(shown("cardholderName"))} aria-describedby={shown("cardholderName") ? "cardholder-name-error" : undefined} />
          </Field>
          <Field id="card-number" label="Card number" error={shown("cardNumber")}>
            <input id="card-number" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"
              value={card.cardNumber} onChange={event => edit("cardNumber", event.target.value)}
              onBlur={() => setTouched(previous => ({ ...previous, cardNumber: true }))}
              aria-invalid={Boolean(shown("cardNumber"))} aria-describedby={shown("cardNumber") ? "card-number-error" : undefined} />
          </Field>
          <div className="it-pay-row">
            <Field id="card-expiry" label="Expiry date" error={shown("expiry")}>
              <input id="card-expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY"
                value={card.expiry} onChange={event => edit("expiry", event.target.value)}
                onBlur={() => setTouched(previous => ({ ...previous, expiry: true }))}
                aria-invalid={Boolean(shown("expiry"))} aria-describedby={shown("expiry") ? "card-expiry-error" : undefined} />
            </Field>
            <Field id="card-cvc" label="CVC" error={shown("cvc")}>
              <input id="card-cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123"
                value={card.cvc} onChange={event => edit("cvc", event.target.value)}
                onBlur={() => setTouched(previous => ({ ...previous, cvc: true }))}
                aria-invalid={Boolean(shown("cvc"))} aria-describedby={shown("cvc") ? "card-cvc-error" : undefined} />
            </Field>
          </div>
          {payError && <p className="ev-alert" role="alert">{payError}</p>}
          <button type="submit" className="it-add it-pay-submit" disabled={!valid || submitting}>
            {submitting ? "Processing payment…" : `Complete order · ${formatAmount(state.total)}`}
          </button>
          {!valid && <p className="ev-muted it-small">Enter valid card details to complete your order.</p>}
        </form>
      </section>
      <aside className="ev-card it-cart-summary" aria-label="Order summary">
        <h2>Order summary</h2>
        <ul className="it-summary-lines">{state.lines.map(line => <li key={line.item_id}>
          <span><span className="it-summary-name">{line.name}</span><span className="ev-muted it-small">Qty {line.quantity}</span></span>
          <span>{formatAmount(line.subtotal)}</span>
        </li>)}</ul>
        <dl>
          <div><dt>Items</dt><dd>{plural(state.count)}</dd></div>
          <div className="it-cart-total"><dt>Total</dt><dd>{formatAmount(state.total)}</dd></div>
        </dl>
      </aside>
    </div>}
  </div>;
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return <div className="it-field">
    <label htmlFor={id}>{label}</label>
    {children}
    {error && <span id={`${id}-error`} className="it-field-error">{error}</span>}
  </div>;
}
