import { useEffect, useState, type ReactNode } from "react";
import { CART_CHANGE_EVENT, fetchCart, type CartSummary } from "../services/cart";
import { signOut, watchSession, type Session } from "../services/session";

const customerLinks = [
  ["Home", "/views/customer/index.html"], ["Items", "/views/customer/items.html"],
  ["Events", "/views/customer/events.html"], ["Appointments", "/views/customer/appointments.html"],
  ["Shopping Cart", "/views/customer/cart.html"], ["Profile", "/views/customer/profile.html"],
  ["Signup", "/views/customer/signup.html"],
];
const adminLinks = [
  ["Dashboard", "/views/admin/index.html"], ["Items", "/views/admin/items.html"],
  ["Inventory", "/views/admin/inventory.html"], ["Orders", "/views/admin/orders.html"],
  ["Events", "/views/admin/events.html"], ["Appointments", "/views/admin/appointments.html"],
];

export function Layout({ admin, children }: { admin: boolean; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    return watchSession((value, error) => {
      setSession(value);
      setMessage(error ? `Session unavailable: ${error.message}` : value ? `Signed in: ${value.user.name}` : "");
    });
  }, []);

  // Cart count badge: only customers have a cart.
  const isCustomer = Boolean(session && !session.user.is_admin);
  useEffect(() => {
    if (admin || !isCustomer) {
      setCartCount(0);
      return;
    }
    let active = true;
    fetchCart().then(cart => { if (active) setCartCount(cart.count); }).catch(() => undefined);
    const onChange = (event: Event) => setCartCount((event as CustomEvent<CartSummary>).detail.count);
    window.addEventListener(CART_CHANGE_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(CART_CHANGE_EVENT, onChange);
    };
  }, [admin, isCustomer]);

  async function logout() {
    setBusy(true);
    try {
      await signOut();
    } catch (error) {
      setMessage(`Sign out failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <nav className={`home-nav${admin ? " admin-nav" : ""}`} aria-label="Main navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <img src="/assets/images/logo.png" alt="Logo" className="nav-logo" loading="lazy" />
          <span className="nav-title">LE PETIT VÉLO ROUGE{admin ? " - ADMIN" : ""}</span>
        </div>
        <ul className="nav-menu">
          {(admin ? adminLinks : customerLinks).map(([label, href]) => <li key={href}>
            {href.endsWith("/cart.html") && cartCount > 0
              ? <a href={href} className="nav-cart-link" aria-label={`${label}, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}>
                {label}<span className="nav-cart-count" aria-hidden="true">{cartCount}</span></a>
              : <a href={href}>{label}</a>}
          </li>)}
          <li><span className="nav-session-status" role="status" aria-live="polite">{message}</span></li>
          <li>{session ? <button type="button" className="nav-logout" disabled={busy} onClick={logout}>Sign Out</button> : <a className="nav-auth nav-login" href="/views/customer/login.html">Sign In</a>}</li>
          {admin && <li><a className="nav-back" href="/views/customer/index.html">← Customer View</a></li>}
        </ul>
      </div>
    </nav>
    {children}
    <footer className="site-footer">
      <div className="footer-grid"><div><h3>LE PETIT VÉLO ROUGE</h3><p>Located in: Concordia University - Loyola Campus<br />
        7141 Rue Sherbrooke O PS 145, Montréal, QC H4B 2B9<br />
        <a href="mailto:petitvelorouge@gmail.com">petitvelorouge@gmail.com</a><br />
        <a href="https://www.instagram.com/LPVR_lepetitvelorouge" target="_blank" rel="noreferrer">@LPVR_lepetitvelorouge</a></p></div></div>
      <div className="footer-bottom"><p>© 2026 LE PETIT VÉLO ROUGE. All rights reserved.</p></div>
    </footer>
  </>;
}
