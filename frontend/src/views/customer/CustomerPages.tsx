import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { getSession, sessionApi, signIn, type Session } from "../../services/session";
import { api, errorMessage, type CustomerProfile } from "../../services/api";
import { Brand } from "../../components/Brand";
import { PhotoBand, photoStyle } from "../../components/Photo";
import { AppointmentsPage } from "./AppointmentsPage";
import { CartPage } from "./CartPage";
import { CheckoutPage } from "./CheckoutPage";
import { CreditsPage } from "./CreditsPage";
import { EventsPage } from "./EventsPage";
import { ItemDetailPage } from "./ItemDetailPage";
import { ItemsPage } from "./ItemsPage";
import { NextUp } from "../../components/Agenda";
import { EventShowcase } from "./EventShowcase";
import { ProductShowcase } from "./ProductShowcase";

function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}

/** Local demo accounts (created on start-up by run_local_website.py). */
const DEMO_LOGINS = {
  customer: { email: "login@example.com", password: "1234" },
  admin: { email: "admin@lpvr.com", password: "123456789" },
};

function Login() {
  const formRef = useRef<HTMLFormElement>(null);
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
  /** Put a demo account into the form and move to Sign in. */
  function fill({ email, password }: { email: string; password: string }) {
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = email;
    (form.elements.namedItem("password") as HTMLInputElement).value = password;
    setError("");
    form.querySelector<HTMLButtonElement>(".login-submit")?.focus();
  }
  return <section className="card login-card" aria-labelledby="login-title">
    <Brand /><h1 id="login-title">Sign in</h1>
    <p className="login-intro">Sign in with your customer or admin account.</p>
    <form ref={formRef} className="stacked-form" onSubmit={submit} aria-busy={busy || undefined}>
      <label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" autoComplete="username" defaultValue={DEMO_LOGINS.customer.email} required />
      <label htmlFor="login-password">Password</label>
      <div className="password-field"><input id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" defaultValue={DEMO_LOGINS.customer.password} required />
        <button type="button" className="password-toggle" aria-controls="login-password" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
      <p className="muted" role="status" aria-live="polite">{busy ? "Signing in..." : ""}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="login-submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
    <div className="login-demo">
      <span className="muted">Local demo accounts</span>
      <button type="button" className="login-fill" onClick={() => fill(DEMO_LOGINS.customer)}>Fill in customer</button>
      <button type="button" className="login-fill" onClick={() => fill(DEMO_LOGINS.admin)}>Fill in admin</button>
    </div>
    <p className="login-signup"><a href="signup.html">Create an account</a></p>
  </section>;
}

function Home() {
  return <>
    <header className="header customer-welcome photo-hero" style={photoStyle("hero-workshop")}>
      <div><Brand large /><h1>Fix your own bike. We'll help.</h1>
        <p className="subtitle">A self-serve community bike shop:use our tools and stands, share knowledge, and get friendly support from volunteers. No experience needed.</p></div></header>
    <NextUp />
    <ProductShowcase />
    <EventShowcase />
    <div className="sections-grid"><section className="card browse-items-section"><PhotoBand name="band-items" /><h2>Browse Items</h2><p className="section-description">Explore our collection of bike parts and tools available for use or purchase.</p><a href="items.html" className="section-link">View all items</a></section>
      <section className="card book-appointment-section"><PhotoBand name="band-appointments" /><h2>Book Appointment</h2><p className="section-description">Schedule a guided session with our expert volunteers for personalized assistance.</p><a href="appointments.html" className="section-link">View appointments</a></section></div>
    <p><a href="/">Return to the local demo</a></p>
  </>;
}

function Signup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CustomerProfile | null>(null);
  // Already signed in? Creating an account would replace that session, so say so instead.
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let active = true;
    getSession().then(value => { if (active) setSession(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    setBusy(true);
    setError("");
    try {
      const result = await api<{ customer: CustomerProfile }>("/api/signup", "POST", {
        first_name: String(data.get("first_name")).trim(),
        last_name: String(data.get("last_name")).trim(),
        email,
        phone: String(data.get("phone")).trim(),
        address: String(data.get("address")).trim(),
        password,
      });
      setCreated(result.customer);
      try {
        await signIn(email, password);
      } catch {
        // The account exists; the customer can still sign in from the login page.
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  if (created) return <Card><h2>Account created</h2>
    <p role="status">Welcome, {created.first_name}! Your customer ID is <strong>{created.customer_code}</strong>.</p>
    <p><a href="profile.html">View your profile</a></p></Card>;
  if (session) return <Card><h2>You're already signed in</h2>
    <p role="status">You are signed in as <strong>{session.user.name}</strong>.</p>
    <p>{session.user.is_admin
      ? <a href="/views/admin/index.html">Go to the admin dashboard</a>
      : <a href="profile.html">Go to My Profile</a>}</p>
    <p className="muted">To create a different account, sign out first.</p></Card>;
  return <Card><h2>Create account</h2>
    <form onSubmit={submit} aria-busy={busy || undefined}><fieldset disabled={busy}>
      <div className="form-row">
        <div><label htmlFor="signup-first-name">First name</label><input id="signup-first-name" name="first_name" autoComplete="given-name" required /></div>
        <div><label htmlFor="signup-last-name">Last name</label><input id="signup-last-name" name="last_name" autoComplete="family-name" required /></div>
      </div>
      <label htmlFor="signup-email">Email</label><input id="signup-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="signup-phone">Phone number</label><input id="signup-phone" name="phone" type="tel" autoComplete="tel" placeholder="514-555-0123" required />
      <label htmlFor="signup-address">Home address</label><input id="signup-address" name="address" autoComplete="street-address" placeholder="Street, city, province, postal code" required />
      <label htmlFor="signup-password">Password</label><input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="signup-password-hint" />
      <p id="signup-password-hint" className="muted">At least 8 characters.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <p><button type="submit">{busy ? "Creating account..." : "Create account"}</button></p></fieldset></form>
    <p>Already have an account? <a href="login.html">Sign in</a></p></Card>;
}

type ProfileField = Exclude<keyof CustomerProfile, "customer_code">;
type FieldSpec = [ProfileField, string, string, string];
const PROFILE_NAME_FIELDS: FieldSpec[] = [
  ["first_name", "First name", "text", "given-name"],
  ["last_name", "Last name", "text", "family-name"],
];
const PROFILE_CONTACT_FIELDS: FieldSpec[] = [
  ["email", "Email", "email", "email"],
  ["phone", "Phone number", "tel", "tel"],
  ["address", "Home address", "text", "street-address"],
];
const PROFILE_FIELDS = [...PROFILE_NAME_FIELDS, ...PROFILE_CONTACT_FIELDS];

function profileInput([field, label, type, autoComplete]: FieldSpec, profile: CustomerProfile, autoFocus = false) {
  return <div key={field}>
    <label htmlFor={`profile-${field}`}>{label}</label>
    <input id={`profile-${field}`} name={field} type={type} autoComplete={autoComplete} defaultValue={profile[field]} autoFocus={autoFocus} required /></div>;
}

function Profile() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    let active = true;
    sessionApi<{ customer: CustomerProfile }>("/api/profile").then(result => {
      if (active) setProfile(result.customer);
    }).catch(reason => { if (active) setLoadError(errorMessage(reason)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);
  function startEditing() {
    setMessage("");
    setError("");
    setEditing(true);
  }
  function stopEditing(savedMessage = "") {
    returnFocus.current = true;
    setError("");
    setMessage(savedMessage);
    setEditing(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const changes = Object.fromEntries(PROFILE_FIELDS.map(([field]) => [field, String(data.get(field)).trim()]));
    setBusy(true);
    setError("");
    try {
      const result = await sessionApi<{ customer: CustomerProfile }>("/api/profile", "PATCH", changes);
      setProfile(result.customer);
      stopEditing("Profile updated.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  if (loadError) return <Card><h2>My Profile</h2><p className="error" role="alert">{loadError}</p>
    <p><a href="login.html">Sign in</a> or <a href="signup.html">create an account</a>.</p></Card>;
  if (!profile) return <Card><h2>My Profile</h2><p role="status">Loading profile…</p></Card>;
  return <Card><h2>My Profile</h2>
    <p>Customer ID: <strong>{profile.customer_code}</strong></p>
    {editing
      ? <form onSubmit={submit} aria-busy={busy || undefined} aria-label="Edit profile"><fieldset disabled={busy}>
          <div className="form-row">{PROFILE_NAME_FIELDS.map((spec, index) => profileInput(spec, profile, index === 0))}</div>
          {PROFILE_CONTACT_FIELDS.map(spec => profileInput(spec, profile))}
          {error && <p className="error" role="alert">{error}</p>}
          <p className="form-actions">
            <button type="submit">{busy ? "Saving..." : "Save changes"}</button>
            <button type="button" className="button-secondary" onClick={() => stopEditing()}>Cancel</button>
          </p></fieldset></form>
      : <>
          <dl className="profile-details">
            {PROFILE_FIELDS.map(([field, label]) => <div key={field}>
              <dt>{label}</dt><dd>{profile[field] || <span className="muted">Not provided</span>}</dd></div>)}
          </dl>
          <p className="muted" role="status" aria-live="polite">{message}</p>
          <p><button type="button" ref={editButton} onClick={startEditing}>Edit profile</button></p>
        </>}
  </Card>;
}

export function CustomerPage({ page }: { page: string }) {
  let content: ReactNode;
  switch (page) {
    case "index": content = <Home />; break;
    case "login": content = <Login />; break;
    case "signup": content = <Signup />; break;
    case "profile": content = <Profile />; break;
    case "items": content = <ItemsPage />; break;
    case "item": content = <ItemDetailPage />; break;
    case "events": content = <EventsPage />; break;
    case "cart": content = <CartPage />; break;
    case "checkout": content = <CheckoutPage />; break;
    case "orders": content = <Card><h2>Order history</h2><p className="customer-notice">Personal order history, statuses, and details require customer sessions and are not available yet.</p></Card>; break;
    case "appointments": content = <AppointmentsPage />; break;
    case "credits": content = <CreditsPage />; break;
    default: content = <Card><h1>Page not found</h1></Card>;
  }
  return <main className={`page customer-content${page === "login" ? " login-page" : ""}`}>{content}</main>;
}
