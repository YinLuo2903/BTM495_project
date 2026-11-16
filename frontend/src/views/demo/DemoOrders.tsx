import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage, formatAmount } from "../../services/api";

export interface Order { order_id: number; order_date: string; total_amount: number; paid: boolean }
export interface Payment { payment_id: number; order_id: number; payment_date: string; amount: number; payment_method: string; paid_status: boolean }

export function DemoOrders({ orders, payments, reload, report, setStatus, available }: {
  orders: Order[]; payments: Payment[]; reload: () => Promise<Order[]>; report: (error: string) => void;
  setStatus: (label: string, state: "ok" | "error") => void; available: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [selected, setSelected] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const unpaid = orders.filter(order => !order.paid);
  useEffect(() => {
    if (dialogOpen && dialog.current && !dialog.current.open) {
      if (typeof dialog.current.showModal === "function") dialog.current.showModal();
      else dialog.current.setAttribute("open", "");
      dialog.current.querySelector<HTMLSelectElement>("#order-id")?.focus();
    }
  }, [dialogOpen]);
  function close() { setDialogOpen(false); setPaymentError(""); }
  async function modify(method: string, path: string, body?: unknown) {
    try { report(""); await api(path, method, body); await reload(); }
    catch (error) { report(errorMessage(error)); }
  }
  function edit(kind: "order" | "payment", id: number, amount: number) {
    const value = window.prompt(`New ${kind === "order" ? "total" : "amount"} for ${kind} #${id}:`, String(amount));
    if (value === null) return;
    if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) <= 0) { report("Enter a positive number."); return; }
    void modify("PATCH", `/api/${kind === "order" ? "orders" : "payments"}/${id}`, { amount: Number(value) });
  }
  function remove(kind: "order" | "payment", id?: number) {
    const resource = kind === "order" ? "orders" : "payments";
    const message = id === undefined ? `Remove ALL ${resource}${kind === "order" ? " and all payments" : ""}?`
      : `Delete ${kind} #${id}${kind === "order" ? " and its payments" : ""}?`;
    if (window.confirm(message)) void modify("DELETE", `/api/${resource}${id === undefined ? "" : `/${id}`}`);
  }
  async function start() {
    let order: Order | undefined = unpaid[0];
    if (!order) {
      setBusy(true);
      try {
        const result = await api<{ order: Order }>("/api/sample-orders", "POST");
        order = (await reload()).find(value => value.order_id === result.order.order_id);
        if (!order) throw new Error("The sample order was created, but the order list could not be refreshed.");
      } catch (error) { report(errorMessage(error)); return; }
      finally { setBusy(false); }
    }
    setSelected(String(order.order_id)); setPaymentError(""); setDialogOpen(true);
  }
  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = orders.find(value => String(value.order_id) === selected && !value.paid);
    if (!order) { setPaymentError("Select an unpaid order."); return; }
    if (!window.confirm(`Confirm mock payment of ${formatAmount(order.total_amount)} for order #${order.order_id}?`)) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setPaymentError("");
    try {
      const result = await api<{ payment: Payment }>("/api/payments", "POST", {
        order_id: order.order_id, card_number: data.get("card_number"),
        expiration_date: data.get("expiration_date"), cvv: data.get("cvv"),
      });
      if (!result.payment.paid_status) {
        setStatus("Payment declined", "error");
        setPaymentError("Payment declined. The order remains unpaid. This demo approves only card number 4242424242424242 with a valid MM/YY expiration and a 3-digit security code. Check your details and try again.");
        return;
      }
      close(); await reload(); setStatus("Payment Successful", "ok");
    } catch (error) { setPaymentError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <>
    <section className="card"><div className="card-heading"><div><h2>Orders</h2><p className="muted">Payments use the total stored on an existing order. A sample order is added if needed.</p></div>
      <div className="button-group"><button type="button" disabled={!available || busy} onClick={() => void start()}>Make a payment</button><button type="button" className="button-danger" onClick={() => remove("order")}>Remove all orders</button></div></div>
      <p role="status">{!available ? "Orders unavailable." : unpaid.length ? `${unpaid.length} unpaid order(s) available.` : orders.length ? "All current orders are paid. A new sample order will be created for testing." : "A sample order will be created when you start a payment."}</p>
      <div className="table-wrap"><table><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {orders.length ? orders.map(order => <tr key={order.order_id}><td>#{order.order_id}</td><td>{order.order_date || "—"}</td><td>{formatAmount(order.total_amount)}</td><td>{order.paid ? "Paid" : "Unpaid"}</td><td>
          <button type="button" aria-label={`Edit order #${order.order_id}`} onClick={() => edit("order", order.order_id, order.total_amount)}>✎</button>
          <button type="button" aria-label={`Delete order #${order.order_id}`} onClick={() => remove("order", order.order_id)}>🗑</button></td></tr>) : <tr><td colSpan={5}>{available ? "No orders are available." : "Orders unavailable."}</td></tr>}
      </tbody></table></div></section>
    <section className="card"><div className="card-heading"><div><h2>Payment history</h2><p className="muted">Sample orders are saved to SQLite; payment attempts and card details are not.</p></div>
      <button type="button" className="button-danger" onClick={() => remove("payment")}>Remove all payments</button></div>
      <div className="table-wrap"><table><thead><tr><th>Payment</th><th>Order</th><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {payments.length ? payments.map(payment => <tr key={payment.payment_id}><td>#{payment.payment_id}</td><td>#{payment.order_id}</td><td>{payment.payment_date}</td><td>{formatAmount(payment.amount)}</td><td>{payment.payment_method}</td><td>{payment.paid_status ? "Approved" : "Declined"}</td><td>
          <button type="button" aria-label={`Edit payment #${payment.payment_id}`} onClick={() => edit("payment", payment.payment_id, payment.amount)}>✎</button>
          <button type="button" aria-label={`Delete payment #${payment.payment_id}`} onClick={() => remove("payment", payment.payment_id)}>🗑</button></td></tr>) : <tr><td colSpan={7}>{available ? "No payment history yet." : "Payment history unavailable."}</td></tr>}
      </tbody></table></div></section>
    {dialogOpen && <dialog ref={dialog} aria-labelledby="payment-title" onCancel={event => { event.preventDefault(); close(); }}>
      <form onSubmit={pay}><div className="dialog-heading"><div><p className="eyebrow">MOCK CREDIT CARD</p><h2 id="payment-title">Payment details</h2></div><button type="button" aria-label="Close payment form" onClick={close}>Close</button></div>
        <p className="muted">This local simulation never contacts a bank or stores card details.</p>
        <label htmlFor="order-id">Order</label><select id="order-id" value={selected} onChange={event => setSelected(event.target.value)} required>{unpaid.map(order => <option key={order.order_id} value={order.order_id}>#{order.order_id} — {formatAmount(order.total_amount)}</option>)}</select>
        <label htmlFor="card-number">Card number</label><input id="card-number" name="card_number" autoComplete="off" defaultValue="4242424242424242" required />
        <div className="form-row"><div><label htmlFor="expiration-date">Expiration (MM/YY)</label><input id="expiration-date" name="expiration_date" autoComplete="off" defaultValue="12/30" required /></div>
          <div><label htmlFor="cvv">Security code</label><input id="cvv" name="cvv" type="password" autoComplete="off" defaultValue="123" required /></div></div>
        {paymentError && <p className="error" role="alert">{paymentError}</p>}
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={busy}>Review payment</button></div>
      </form></dialog>}
  </>;
}
