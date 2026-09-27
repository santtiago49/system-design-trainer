import "server-only";

import { randomBytes } from "node:crypto";
import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";
import type { TokenCredential } from "@azure/core-auth";

// "Sign in with Microsoft": the user signs in with their work account and we call
// Azure Resource Manager on their behalf, seeing exactly what they can see.
export const ARM_SCOPE = "https://management.azure.com/user_impersonation";
export const SESSION_COOKIE = "sdt_session";

const LOGIN_TTL_MS = 10 * 60 * 1000;

type PendingLogin = { verifier: string; returnTo: string; createdAt: number };
type Session = { homeAccountId: string; name: string; username: string };

// In-memory stores: fine for a single-process prototype, lost on restart (the user
// just signs in again). Kept on globalThis so dev hot reloads don't drop them.
const store = globalThis as unknown as {
  __sdtPending?: Map<string, PendingLogin>;
  __sdtSessions?: Map<string, Session>;
  __sdtMsal?: ConfidentialClientApplication;
};
const pending = (store.__sdtPending ??= new Map());
const sessions = (store.__sdtSessions ??= new Map());

export class AuthNotConfiguredError extends Error {
  constructor() {
    super("Sign-in isn't configured: set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env.local and restart the dev server.");
    this.name = "AuthNotConfiguredError";
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super("Sign in with Microsoft to read your Azure subscriptions.");
    this.name = "NotSignedInError";
  }
}

function msal(): ConfidentialClientApplication {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new AuthNotConfiguredError();
  // "organizations" accepts work accounts from any Entra ID tenant (a multi-tenant app).
  return (store.__sdtMsal ??= new ConfidentialClientApplication({
    auth: { clientId, clientSecret, authority: "https://login.microsoftonline.com/organizations" },
  }));
}

export function redirectUri(): string {
  return process.env.AZURE_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback";
}

/** Builds the Microsoft sign-in URL, with PKCE and a one-time state. */
export async function startLogin(returnTo: string): Promise<string> {
  const { verifier, challenge } = await new CryptoProvider().generatePkceCodes();
  const state = randomBytes(24).toString("base64url");
  const now = Date.now();
  for (const [key, login] of pending) if (now - login.createdAt > LOGIN_TTL_MS) pending.delete(key);
  pending.set(state, { verifier, returnTo, createdAt: now });
  return msal().getAuthCodeUrl({
    scopes: [ARM_SCOPE],
    redirectUri: redirectUri(),
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    prompt: "select_account",
  });
}

/** Exchanges the code for tokens and opens a session. Returns the session id and where to go next. */
export async function completeLogin(code: string, state: string): Promise<{ sessionId: string; returnTo: string }> {
  const login = pending.get(state);
  pending.delete(state);
  if (!login || Date.now() - login.createdAt > LOGIN_TTL_MS) throw new Error("Sign-in expired or was not started here. Try again.");
  const result = await msal().acquireTokenByCode({
    code,
    scopes: [ARM_SCOPE],
    redirectUri: redirectUri(),
    codeVerifier: login.verifier,
  });
  if (!result.account) throw new Error("Microsoft returned no account.");
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, {
    homeAccountId: result.account.homeAccountId,
    name: result.account.name ?? result.account.username,
    username: result.account.username,
  });
  return { sessionId, returnTo: login.returnTo };
}

export function getSession(sessionId: string | undefined): Session | null {
  return (sessionId && sessions.get(sessionId)) || null;
}

export function endSession(sessionId: string | undefined) {
  if (sessionId) sessions.delete(sessionId);
}

/** A credential for the Azure SDKs that uses the signed-in user's token, refreshed silently by MSAL. */
export function userCredential(sessionId: string | undefined): TokenCredential {
  const session = getSession(sessionId);
  if (!session) throw new NotSignedInError();
  return {
    async getToken() {
      const client = msal();
      const account = await client.getTokenCache().getAccountByHomeId(session.homeAccountId);
      if (!account) throw new NotSignedInError();
      const result = await client.acquireTokenSilent({ account, scopes: [ARM_SCOPE] });
      if (!result?.accessToken || !result.expiresOn) throw new NotSignedInError();
      return { token: result.accessToken, expiresOnTimestamp: result.expiresOn.getTime() };
    },
  };
}
