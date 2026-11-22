/**
 * Two-step progress shown under the Shopping Cart and Payment page headers.
 * Step 1 links back to the cart once completed; step 2 is never a link, so
 * Payment is only reached through the cart's Checkout button.
 */
export function CheckoutSteps({ current }: { current: 1 | 2 }) {
  const cartDone = current === 2;
  return <nav className="it-steps-nav" aria-label="Checkout progress">
    <ol className="it-steps">
      <li className={`it-step ${cartDone ? "it-step-complete" : "it-step-active"}`} aria-current={cartDone ? undefined : "step"}>
        {cartDone
          ? <a href="cart.html" className="it-step-body"><StepMark done />Shopping Cart<span className="it-sr-only"> (completed)</span></a>
          : <span className="it-step-body"><StepMark number={1} />Shopping Cart</span>}
      </li>
      <li className={`it-step ${cartDone ? "it-step-active" : ""}`} aria-current={cartDone ? "step" : undefined}>
        <span className="it-step-body"><StepMark number={2} />Payment</span>
      </li>
    </ol>
  </nav>;
}

function StepMark({ number, done = false }: { number?: number; done?: boolean }) {
  return <span className="it-step-mark" aria-hidden="true">
    {done
      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      : number}
  </span>;
}
