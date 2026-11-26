import { useEffect, useState, type ReactNode } from "react";
import { photoStyle } from "./Photo";
import { SiteNav } from "./SiteNav";
import { CART_CHANGE_EVENT, fetchCart, type CartSummary } from "../services/cart";
import { signOut, watchSession, type Session } from "../services/session";

/** Customer pages' navigation and footer (admin pages use their own sidebar). */
export function Layout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    return watchSession((value, error) => {
      setSession(value);
      // The signed-in name is shown as the account link, so only problems go here.
      setMessage(error ? `Session unavailable: ${error.message}` : "");
    });
  }, []);

  // Cart count badge: only customers have a cart.
  const isCustomer = Boolean(session && !session.user.is_admin);
  useEffect(() => {
    if (!isCustomer) {
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
  }, [isCustomer]);

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
    <SiteNav session={session} cartCount={cartCount} message={message} busy={busy} onSignOut={() => void logout()} />
    {children}
    <footer className="site-footer photo-footer" style={photoStyle("footer-team")}>
      <div className="footer-grid"><div><h3>LE PETIT VÉLO ROUGE</h3><p>Located in: Concordia University - Loyola Campus<br />
        7141 Rue Sherbrooke O PS 145, Montréal, QC H4B 2B9<br />
        <a href="mailto:petitvelorouge@gmail.com">petitvelorouge@gmail.com</a><br />
        <a href="https://www.instagram.com/LPVR_lepetitvelorouge" target="_blank" rel="noreferrer">@LPVR_lepetitvelorouge</a></p></div></div>
      <div className="footer-bottom"><p>© 2026 LE PETIT VÉLO ROUGE · Site code under the MIT License · <a href="/views/customer/credits.html">Photo credits</a></p></div>
    </footer>
  </>;
}
