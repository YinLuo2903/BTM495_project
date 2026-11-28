import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Item } from "../services/api";
import type { Session } from "../services/session";
import { ADMIN_HOME_URL } from "../urls";
import { Brand } from "./Brand";

const HOME_URL = "/views/customer/index.html";
const ITEMS_URL = "/views/customer/items.html";
const CART_URL = "/views/customer/cart.html";
const PROFILE_URL = "/views/customer/profile.html";

// Profile and Create account are not menu links: they live in the account area
// (signed-in name → My Profile; guests see Sign In · Create account).
const EVENTS_URL = "/views/customer/events.html";
const APPOINTMENTS_URL = "/views/customer/appointments.html";
const pageLinks: [string, string][] = [
  ["Home", HOME_URL], ["Items", ITEMS_URL], ["Events", EVENTS_URL], ["Appointments", APPOINTMENTS_URL],
];
/** Fixed sub-menus; Items gets its categories from the inventory instead. */
const subLinks: Record<string, [string, string][]> = {
  [EVENTS_URL]: [["My events", `${EVENTS_URL}#mine`], ["Event calendar", `${EVENTS_URL}#calendar`]],
  [APPOINTMENTS_URL]: [["My appointments", `${APPOINTMENTS_URL}#mine`], ["Book a repair", `${APPOINTMENTS_URL}#book`]],
};

const isCurrent = (href: string) => window.location.pathname === href
  || (href === HOME_URL && ["/", "/views/index.html", "/view/index.html", "/views/customer/", "/views/customer"].includes(window.location.pathname));

const Chevron = () => <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>;

/** Item categories from the live inventory, for the Items sub-menu. */
function useCategories(): string[] {
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    api<{ items: Item[] }>("/api/inventory").then(result => {
      if (!active) return;
      const names = new Set(result.items.map(item => item.category?.trim()).filter((name): name is string => Boolean(name)));
      setCategories([...names].sort((a, b) => a.localeCompare(b)));
    }).catch(() => undefined); // the menu still works without categories
    return () => { active = false; };
  }, []);
  return categories;
}

/** A top-level entry that opens its sub-menu on hover (mouse), focus (keyboard) or tap (the chevron). */
function Dropdown({ id, label, trigger, open, onToggle, children }: {
  id: string; label: string; trigger: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return <li className={`nav-dropdown${open ? " is-open" : ""}`}>
    {trigger}
    <button type="button" className="nav-caret" aria-expanded={open} aria-controls={id} aria-label={`${label} menu`} onClick={onToggle}><Chevron /></button>
    <ul className="nav-submenu" id={id}>{children}</ul>
  </li>;
}

export function SiteNav({ session, cartCount, message, busy, onSignOut }: {
  session: Session | null; cartCount: number; message: string; busy: boolean; onSignOut: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const categories = useCategories();
  const navRef = useRef<HTMLElement>(null);
  const toggle = (name: string) => setOpenMenu(current => current === name ? null : name);

  // Escape or a click outside closes any open menu.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpenMenu(null); setPanelOpen(false); }
    }
    function onClick(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) { setOpenMenu(null); setPanelOpen(false); }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  const pageLink = ([label, href]: [string, string]) => <a className="nav-link" href={href} aria-current={isCurrent(href) ? "page" : undefined}>{label}</a>;
  const accountHref = session?.user.is_admin ? ADMIN_HOME_URL : PROFILE_URL;

  return <nav className="home-nav" aria-label="Main navigation" ref={navRef}>
    <div className="nav-container">
      <a className="nav-brand" href={HOME_URL} aria-label="LE PETIT VÉLO ROUGE home">
        <Brand />
      </a>
      <button type="button" className="nav-toggle" aria-expanded={panelOpen} aria-controls="nav-panel"
        aria-label={panelOpen ? "Close menu" : "Open menu"} onClick={() => setPanelOpen(!panelOpen)}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {panelOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
      </button>
      <div id="nav-panel" className={`nav-panel${panelOpen ? " is-open" : ""}`}>
        <ul className="nav-menu">
          {pageLinks.map(([label, href]) => {
            const items: [string, string][] | undefined = href === ITEMS_URL
              ? [["All items", ITEMS_URL], ...categories.map((category): [string, string] => [category, `${ITEMS_URL}?q=${encodeURIComponent(category)}`])]
              : subLinks[href];
            const name = label.toLowerCase();
            return items
              ? <Dropdown key={href} id={`nav-${name}-menu`} label={label} trigger={pageLink([label, href])} open={openMenu === name} onToggle={() => toggle(name)}>
                {items.map(([text, link]) => <li key={link}><a href={link} onClick={() => setOpenMenu(null)}>{text}</a></li>)}
              </Dropdown>
              : <li key={href}>{pageLink([label, href])}</li>;
          })}
        </ul>
        <ul className="nav-actions">
          <li><span className="nav-session-status" role="status" aria-live="polite">{message}</span></li>
          <li>
            <a href={CART_URL} className="nav-link nav-cart-link" aria-current={isCurrent(CART_URL) ? "page" : undefined}
              aria-label={cartCount > 0 ? `Shopping Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}` : "Shopping Cart"}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3" /></svg>
              <span>Cart</span>
              {cartCount > 0 && <span className="nav-cart-count" aria-hidden="true">{cartCount}</span>}
            </a>
          </li>
          {session
            ? <Dropdown id="nav-account-menu" label="Account" open={openMenu === "account"} onToggle={() => toggle("account")}
              trigger={<a className="nav-link nav-account" href={accountHref}
                aria-label={session.user.is_admin ? `Admin dashboard, signed in as ${session.user.name}` : `My profile, signed in as ${session.user.name}`}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                <span>{session.user.name}</span>
              </a>}>
              <li><a href={accountHref}>{session.user.is_admin ? "Admin dashboard" : "My profile"}</a></li>
              {!session.user.is_admin && <li><a href="/views/customer/orders.html">My orders</a></li>}
              <li><button type="button" disabled={busy} onClick={onSignOut}>Sign Out</button></li>
            </Dropdown>
            : <>
              <li><a className="nav-link" href="/views/customer/login.html" aria-current={isCurrent("/views/customer/login.html") ? "page" : undefined}>Sign In</a></li>
              <li><a className="nav-signup" href="/views/customer/signup.html">Create account</a></li>
            </>}
        </ul>
      </div>
    </div>
  </nav>;
}
