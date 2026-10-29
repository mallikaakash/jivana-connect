#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  authHelpMessage,
  printCursorAuthStatus,
  runCursorLogin,
} from "./lib/cursor-auth.mjs";
import { Cursor, AuthenticationError } from "@cursor/sdk";

const { values } = parseArgs({
  options: {
    login: { type: "boolean", default: false },
    status: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run cursor:login
       npm run cursor:auth -- --status

One-time browser login for Cursor SDK scripts (same account as Cursor Cloud).
Stores credentials in ~/.cursor/sdk/auth.json — no need to paste Integrations keys unless you prefer to.

Options:
  --login     Run browser login (default when no flags)
  --status    Show whether SDK credentials exist
  -h, --help
`);
  process.exit(0);
}

async function main() {
  if (values.status) {
    process.exit(await printCursorAuthStatus());
  }

  try {
    await runCursorLogin();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
