import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { signIn } from "../../services/session";
import { api, errorMessage, formatAmount, type Item, type ShopEvent } from "../../services/api";

function useRemote<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<T>(path).then(value => { if (active) setData(value); }).catch(reason => {
      if (active) setError(errorMessage(reason));
    });
    return () => { active = false; };
  }, [path]);
  return { data, error };
}

function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}

function Events({ home = false }: { home?: boolean }) {
  const { data, error } = useRemote<{ events: ShopEvent[] }>("/api/events");
  const events = home ? data?.events.slice(0, 3) : data?.events;
  return <>
    <p role="status" className={error ? "error" : undefined}>{error || (!events ? "Loading events…" : events.length ? "" : "No events available.")}</p>
    <ul className={home ? "events-grid" : "customer-list"}>{events?.map(event =>
      <li key={event.event_id}><strong>{event.name}</strong><p>{event.customer_ids.length} / {event.participant_limit} registered</p></li>)}</ul>
  </>;
}

function Login() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const user = await signIn(String(data.get("email")), String(data.get("password")));
      form.reset();
      setVisible(false);
      window.location.assign(user.is_admin ? "/views/admin/index.html" : "/views/customer/index.html");
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }
  return <section className="card login-card" aria-labelledby="login-title">
    <p className="login-eyebrow">LE PETIT VÉLO ROUGE</p><h1 id="login-title">Sign in</h1>
    <p className="login-intro">Sign in with your customer or admin account.</p>
    <form id="login-form" onSubmit={submit} aria-busy={busy || undefined}>
      <label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="login-password">Password</label>
      <div className="password-field"><input id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required />
        <button type="button" className="password-toggle" aria-controls="login-password" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
      <p className="muted" role="status" aria-live="polite">{busy ? "Signing in..." : ""}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="login-submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
    <p className="login-demo muted">Local demo: <code>login@example.com</code> / <code>1234</code></p>
    <p className="login-signup"><a href="signup.html">Create an account</a></p>
  </section>;
}

function Items({ detail = false }: { detail?: boolean }) {
  const { data, error } = useRemote<{ items: Item[] }>("/api/inventory");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const items = data?.items ?? [];
  const id = new URLSearchParams(location.search).get("id");
  const item = id && /^[1-9]\d*$/.test(id) ? items.find(value => String(value.item_id) === id) : undefined;
  const categories = [...new Set(items.map(value => value.category).filter(Boolean))].sort();
  const matching = items.filter(value => (!category || value.category === category) &&
    [value.name, value.brand].some(text => (text || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const details = (value: Item) => `${formatAmount(value.price)}${value.brand ? ` · ${value.brand}` : ""}${value.category ? ` · ${value.category}` : ""}`;
  if (detail) return <Card><p role="status" className={error ? "error" : undefined}>{error || (!id || !/^[1-9]\d*$/.test(id) ? "Choose an item from the items page." : !data ? "Loading item…" : !item ? "Item not found." : "")}</p>
    {item && <div><h2>{item.name}</h2><p>{item.description || "No description available."}</p><p>{details(item)}</p></div>}
    <p className="customer-notice">Adding items to a cart is not available yet.</p><button disabled>Add to cart</button><p><a href="items.html">Back to items</a></p></Card>;
  return <Card><h2>Browse items</h2><label htmlFor="item-search">Search by name or brand</label>
    <input id="item-search" type="search" value={search} onChange={event => setSearch(event.target.value)} />
    <label htmlFor="item-category">Category</label><select id="item-category" value={category} onChange={event => setCategory(event.target.value)}>
      <option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select>
    <p role="status" className={error ? "error" : undefined}>{error || (!data ? "Loading items…" : matching.length ? "" : "No items found.")}</p>
    <ul className="customer-list">{matching.map(value => <li key={value.item_id}><a href={`item.html?id=${encodeURIComponent(value.item_id)}`}>{value.name}</a><p>{details(value)}</p></li>)}</ul>
  </Card>;
}

function Home() {
  return <>
    <header className="header customer-welcome"><img src="/assets/images/logo.png" alt="LE PETIT VÉLO ROUGE Logo" className="header-logo" />
      <div><p className="eyebrow">LE PETIT VÉLO ROUGE</p><h1>Fix your own bike. We'll help.</h1>
        <p className="subtitle">A self-serve community bike shop:use our tools and stands, share knowledge, and get friendly support from volunteers. No experience needed.</p></div></header>
    <section className="card events-section"><h2>Upcoming Events</h2><p className="events-description">Discover our community activities.</p><Events home /><a href="events.html" className="events-link">View all events</a></section>
    <div className="sections-grid"><section className="card browse-items-section"><h2>Browse Items</h2><p className="section-description">Explore our collection of bike parts and tools available for use or purchase.</p><a href="items.html" className="section-link">View all items</a></section>
      <section className="card book-appointment-section"><h2>Book Appointment</h2><p className="section-description">Schedule a guided session with our expert volunteers for personalized assistance.</p><a href="appointments.html" className="section-link">View appointments</a></section></div>
    <p><a href="/">Return to the local demo</a></p>
  </>;
}

function Signup() {
  return <Card><h2>Signup</h2><p className="customer-notice">Account creation is not available in this demo yet.</p>
    <form><fieldset disabled><label htmlFor="signup-name">Name</label><input id="signup-name" autoComplete="name" />
      <label htmlFor="signup-email">Email</label><input id="signup-email" type="email" autoComplete="email" />
      <label htmlFor="signup-password">Password</label><input id="signup-password" type="password" autoComplete="new-password" />
      <p><button type="submit">Create account</button></p></fieldset></form></Card>;
}

function Profile() {
  return <Card><h2>Profile details</h2><p className="customer-notice">Viewing and editing a personal profile requires a customer session and is not available yet.</p>
    <form><fieldset disabled><label htmlFor="profile-name">Name</label><input id="profile-name" autoComplete="name" />
      <label htmlFor="profile-email">Email</label><input id="profile-email" type="email" autoComplete="email" />
      <label htmlFor="profile-phone">Phone</label><input id="profile-phone" type="tel" autoComplete="tel" />
      <label htmlFor="profile-address">Address</label><input id="profile-address" autoComplete="street-address" />
      <p><button type="submit">Save profile</button></p></fieldset></form></Card>;
}

export function CustomerPage({ page }: { page: string }) {
  let content: ReactNode;
  switch (page) {
    case "index": content = <Home />; break;
    case "login": content = <Login />; break;
    case "signup": content = <Signup />; break;
    case "profile": content = <Profile />; break;
    case "items": content = <Items />; break;
    case "item": content = <Items detail />; break;
    case "events": content = <Card><h2>Event list</h2><p className="customer-notice">Customer registration and unregistration require a signed-in session and are not available on this page yet.</p><Events /></Card>; break;
    case "cart": content = <Card><h2>Cart items</h2><p className="customer-notice">Customer carts, quantities, and totals are not available yet.</p><button disabled>Checkout</button><p><a href="checkout.html">View checkout page</a></p></Card>; break;
    case "checkout": content = <Card><h2>Review your order</h2><p className="customer-notice">Customer checkout is not available yet. The local demo supports mock credit-card payments only.</p><form><fieldset disabled><label htmlFor="payment-method">Payment method</label><select id="payment-method"><option>Credit card</option><option>Debit card</option></select><p><button>Confirm order</button></p></fieldset></form></Card>; break;
    case "orders": content = <Card><h2>Order history</h2><p className="customer-notice">Personal order history, statuses, and details require customer sessions and are not available yet.</p></Card>; break;
    case "appointments": content = <><Card><h2>Book an appointment</h2><p className="customer-notice">Booking and personal appointment lists are not available yet.</p><form><fieldset disabled><label htmlFor="appointment-date">Date and time</label><input id="appointment-date" type="datetime-local" /><label htmlFor="appointment-notes">Service</label><input id="appointment-notes" /><p><button>Book appointment</button></p></fieldset></form></Card><Card><h2>Your appointments</h2><p className="muted">Appointment history is not available yet.</p></Card></>; break;
    default: content = <Card><h1>Page not found</h1></Card>;
  }
  return <main className={`page customer-content${page === "login" ? " login-page" : ""}`}>{content}</main>;
}
