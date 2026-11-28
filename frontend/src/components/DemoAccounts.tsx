import type { RefObject } from "react";

/** Local demo accounts (created on start-up by run_local_website.py). */
export const DEMO_LOGINS = {
  customer: { email: "login@example.com", password: "1234" },
  admin: { email: "admin@lpvr.com", password: "123456789" },
};

/**
 * "Fill in customer / Fill in admin" under a sign-in form: puts a demo account into the
 * form's email and password fields and moves focus to its submit button.
 */
export function DemoAccountButtons({ formRef, onFill }: { formRef: RefObject<HTMLFormElement | null>; onFill?: () => void }) {
  function fill({ email, password }: { email: string; password: string }) {
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = email;
    (form.elements.namedItem("password") as HTMLInputElement).value = password;
    onFill?.();
    form.querySelector<HTMLButtonElement>("button[type=submit], button:not([type])")?.focus();
  }
  return <div className="login-demo">
    <span className="muted">Local demo accounts</span>
    <button type="button" className="demo-fill" onClick={() => fill(DEMO_LOGINS.customer)}>Fill in customer</button>
    <button type="button" className="demo-fill" onClick={() => fill(DEMO_LOGINS.admin)}>Fill in admin</button>
  </div>;
}
