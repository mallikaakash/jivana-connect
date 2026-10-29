import { Cursor, FileCredentialStore, getDefaultSdkAuthPath } from "@cursor/sdk";

const store = new FileCredentialStore();

/** Env var, else key minted by `Cursor.auth.login()` (~/.cursor/sdk/auth.json). */
export async function resolveCursorApiKey() {
  const fromEnv = process.env.CURSOR_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const stored = await store.load();
  if (stored?.apiKey?.trim()) {
    return stored.apiKey.trim();
  }

  return undefined;
}

export async function printCursorAuthStatus() {
  const status = await Cursor.auth.status({ store });
  if (status.status === "logged-in") {
    console.log(
      JSON.stringify(
        {
          loggedIn: true,
          email: status.email,
          apiKeyExpiresAtMs: status.apiKeyExpiresAtMs,
          authPath: getDefaultSdkAuthPath(),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(JSON.stringify({ loggedIn: false }, null, 2));
  return 1;
}

export async function runCursorLogin() {
  const result = await Cursor.auth.login({
    store,
    apiKeyName: "clini-ai implement-spec",
  });
  console.log(`Logged in as ${result.email ?? "unknown"}. Credentials saved for SDK scripts.`);
  return result.apiKey;
}

export function authHelpMessage() {
  return `No Cursor API credentials found.

Your repo can live on Cursor Cloud (origin.cursor.com) and you can use Cloud Agents in the IDE with your normal login — but **npm scripts use the Cursor Agent SDK**, which is a separate API surface and still needs an API key.

Easiest fix (same Cursor account, one browser login):

  npm run cursor:login

Or set CURSOR_API_KEY from Dashboard → Integrations.

The minted key is stored in ~/.cursor/sdk/auth.json (not in the repo).`;
}
