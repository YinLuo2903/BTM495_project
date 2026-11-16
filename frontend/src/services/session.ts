import { errorMessage } from "./api";

export interface SessionUser {
  name: string;
  is_admin: boolean;
}

export interface Session {
  user: SessionUser;
  expiresAt: number;
}

interface StoredSession {
  token: string;
  expiresAt: number;
}

interface SessionResponse {
  status: string;
  user?: SessionUser;
  token?: string;
  expires_at?: number;
  message?: string;
}

const SESSION_KEY = "lpvr.session";
const CHANGE_EVENT = "lpvr-session-change";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    throw new Error("Stored session was invalid. Please sign in again.");
  }
  if (typeof value !== "object" || value === null ||
      !("token" in value) || typeof value.token !== "string" ||
      !TOKEN_PATTERN.test(value.token) || !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)) {
    localStorage.removeItem(SESSION_KEY);
    throw new Error("Stored session was invalid. Please sign in again.");
  }
  return { token: value.token, expiresAt: value.expiresAt };
}

function clearSession(token: string): void {
  const current = readSession();
  if (current && current.token === token) {
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

async function requestSession(path: string, token: string, method = "GET"): Promise<SessionResponse | null> {
  const response = await fetch(path, {
    method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Session request failed (HTTP ${response.status}).`);
  const result: SessionResponse = await response.json();
  if (result.status !== "ok") throw new Error("Invalid session response.");
  return result;
}

function validUser(user: SessionUser | undefined): user is SessionUser {
  return Boolean(user && typeof user.name === "string" && typeof user.is_admin === "boolean");
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const response = await fetch("/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }), cache: "no-store",
  });
  const result: SessionResponse = await response.json();
  if (!response.ok || result.status !== "ok") {
    throw new Error(result.message || `Login failed with HTTP ${response.status}.`);
  }
  if (typeof result.token !== "string" || !TOKEN_PATTERN.test(result.token) ||
      typeof result.expires_at !== "number" || !Number.isSafeInteger(result.expires_at) ||
      !validUser(result.user)) {
    throw new Error("Invalid login response.");
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: result.token, expiresAt: result.expires_at }));
  } catch (error) {
    try {
      await requestSession("/api/logout", result.token, "POST");
    } catch (revokeError) {
      throw new Error(`Could not save or revoke the session: ${errorMessage(revokeError)}`);
    }
    throw new Error(`Could not save the session: ${errorMessage(error)}`);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return result.user;
}

export async function getSession(): Promise<Session | null> {
  const stored = readSession();
  if (!stored) return null;
  const result = await requestSession("/api/session", stored.token);
  if (!result) {
    clearSession(stored.token);
    return null;
  }
  if (!validUser(result.user)) throw new Error("Invalid session response.");
  return { user: result.user, expiresAt: stored.expiresAt };
}

export async function signOut(): Promise<void> {
  const stored = readSession();
  if (!stored) return;
  await requestSession("/api/logout", stored.token, "POST");
  clearSession(stored.token);
}

export function watchSession(callback: (session: Session | null, error: Error | null) => void): () => void {
  let version = 0;
  let timer: ReturnType<typeof setTimeout>;
  async function refresh() {
    const requestVersion = ++version;
    clearTimeout(timer);
    try {
      const session = await getSession();
      if (requestVersion !== version) return;
      callback(session, null);
      if (session) {
        const delay = Math.max(1000, session.expiresAt * 1000 - Date.now());
        timer = setTimeout(refresh, Math.min(delay, 2147483647));
      }
    } catch (error) {
      if (requestVersion === version) callback(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
  function onStorage(event: StorageEvent) {
    if (event.key === SESSION_KEY || event.key === null) void refresh();
  }
  window.addEventListener(CHANGE_EVENT, refresh);
  window.addEventListener("storage", onStorage);
  void refresh();
  return () => {
    version++;
    clearTimeout(timer);
    window.removeEventListener(CHANGE_EVENT, refresh);
    window.removeEventListener("storage", onStorage);
  };
}
