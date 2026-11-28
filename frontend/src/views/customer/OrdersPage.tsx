import { useCustomerData } from "../../components/Agenda";
import { formatAmount } from "../../services/api";
import { sessionApi } from "../../services/session";
import { ItemImage } from "./addToCart";

export interface MyOrder {
  order_id: number;
  /** "YYYY-MM-DD HH:MM:SS" */
  date: string | null;
  total: number;
  /** 1 Pending (preparing), 4 Ready for pick-up, 2 Completed (picked up), 3 Cancelled */
  status_id: number | null;
  items: { item_id: number; name: string; image_path: string | null; quantity: number; unit_price: number }[];
  payment: { date: string; amount: number; method: string; status_id: number } | null;
}

const PAID = 2;
const loadOrders = () => sessionApi<{ orders: MyOrder[] }>("/api/my-orders").then(result => result.orders);

/** What the customer needs to know, in their words. */
export function orderStatus(order: MyOrder): { label: string; note: string; tone: "progress" | "ready" | "done" | "off" | "wait" } {
  if (order.status_id === 3) return { label: "Cancelled", note: "This order was cancelled.", tone: "off" };
  if (order.status_id === 2) return { label: "Picked up", note: "Collected at the shop.", tone: "done" };
  if (order.status_id === 4) return { label: "Ready for pick-up", note: "Come by the shop (Loyola Campus, PS 145) to collect it.", tone: "ready" };
  if (order.payment?.status_id === PAID) return { label: "Preparing", note: "Our volunteers are getting it ready.", tone: "progress" };
  return { label: "Awaiting payment", note: "Not paid yet.", tone: "wait" };
}

const STAGES = ["Preparing", "Ready for pick-up", "Picked up"];

/** Three-step tracker under the order header; hidden for cancelled or unpaid orders. */
function Tracker({ order }: { order: MyOrder }) {
  const at = STAGES.indexOf(orderStatus(order).label);
  if (at < 0) return null;
  const finished = at === STAGES.length - 1; // picked up: every step is done
  return <ol className="my-order-track" aria-label="Order progress">
    {STAGES.map((stage, n) => <li key={stage} className={n < at || finished ? "is-done" : n === at ? "is-current" : undefined}
      aria-current={n === at ? "step" : undefined}>{stage}</li>)}
  </ol>;
}

const when = (value: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value ?? "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
};

/** orders.html: the signed-in customer's orders, newest first, with status, items and payment. */
export function OrdersPage() {
  const [state] = useCustomerData(loadOrders);
  return <div className="ev-page it-page">
    <header className="ev-header">
      <h1>My orders</h1>
      <p>Track what you bought and where each order is.</p>
    </header>
    {state.kind === "loading" ? <section className="ev-card it-detail-notice"><p role="status">Loading your orders…</p></section>
    : state.kind === "guest" ? <section className="ev-card it-empty">
      <h2>Sign in to see your orders</h2>
      <p><a href="login.html">Sign in</a> or <a href="signup.html">create an account</a>.</p>
    </section>
    : state.kind === "error" ? <section className="ev-card it-detail-notice"><p className="ev-alert" role="alert">Could not load your orders: {state.message}</p></section>
    : !state.value.length ? <section className="ev-card it-empty">
      <h2>No orders yet</h2>
      <p><a href="items.html">Browse items</a> to place your first order.</p>
    </section>
    : <ol className="my-orders">{state.value.map(order => {
      const status = orderStatus(order);
      return <li key={order.order_id} className="ev-card my-order" aria-labelledby={`order-${order.order_id}`}>
        <div className="my-order-head">
          <div>
            <h2 id={`order-${order.order_id}`}>Order #{order.order_id}</h2>
            <p className="ev-muted it-small">Placed {when(order.date)}</p>
          </div>
          <span className={`my-order-status is-${status.tone}`}>{status.label}</span>
        </div>
        <Tracker order={order} />
        <ul className="my-order-items">{order.items.map(line => <li key={line.item_id}>
          <ItemImage src={line.image_path} />
          <a href={`item.html?id=${line.item_id}`}>{line.name}</a>
          <span className="ev-muted">× {line.quantity}</span>
          <span>{formatAmount(line.unit_price * line.quantity)}</span>
        </li>)}</ul>
        <div className="my-order-foot">
          <span className="ev-muted it-small">{status.note}{order.payment ? ` Paid by ${order.payment.method.toLowerCase()} on ${when(order.payment.date)}.` : ""}</span>
          <strong>Total {formatAmount(order.total)}</strong>
        </div>
      </li>;
    })}</ol>}
  </div>;
}
