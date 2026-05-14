/**
 * `muse auth` command group, extracted from apps/cli/src/program.ts.
 *
 * Self-contained: only consumes the existing credential-store
 * helpers passed in as dependencies. Wraps the bearer-token CLI
 * surface (login / status / logout) in commander argument-parsing.
 * Same DI pattern as the scheduler / orchestrate / mcp / specs /
 * config extractions.
 *
 * The credential-store helpers themselves stay defined in
 * `program.ts` because they're shared with the API-request path
 * (`readApiOptions`, `apiRequest`).
 */

import type { Command } from "commander";

import {
  defaultAuthSecretsFile,
  readJwtRotationState,
  rotateJwtState,
  writeJwtRotationState
} from "./jwt-rotation-store.js";
import type { ProgramIO } from "./program.js";

export interface ReadApiOptionsResult {
  readonly baseUrl: string;
  readonly token?: string;
}

export interface AuthCommandHelpers {
  readonly readApiOptions: (
    io: ProgramIO,
    command: Command,
    options?: { readonly includeStoredToken?: boolean }
  ) => Promise<ReadApiOptionsResult>;
  readonly readStoredToken: (io: ProgramIO, baseUrl: string) => Promise<string | undefined>;
  readonly writeStoredToken: (io: ProgramIO, baseUrl: string, token: string) => Promise<void>;
  readonly deleteStoredToken: (io: ProgramIO, baseUrl: string) => Promise<void>;
  readonly resolveAuthToken: (io: ProgramIO, token: string | undefined) => Promise<string>;
  readonly credentialPath: (io: ProgramIO) => string;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerAuthCommands(program: Command, io: ProgramIO, helpers: AuthCommandHelpers): void {
  const auth = program.command("auth").description("Manage CLI credentials");

  auth
    .command("login")
    .description("Store a bearer token in the encrypted CLI credential store")
    .argument("[token]", "Bearer token to store")
    .action(async (token: string | undefined, _options, command) => {
      const { baseUrl } = await helpers.readApiOptions(io, command, { includeStoredToken: false });
      await helpers.writeStoredToken(io, baseUrl, await helpers.resolveAuthToken(io, token));
      io.stdout(`Stored Muse API token for ${baseUrl}\n`);
    });

  auth
    .command("status")
    .description("Check whether a token is stored for the active API URL")
    .option("--json", "Print machine-readable JSON")
    .action(async (options: { readonly json?: boolean }, command) => {
      const { baseUrl } = await helpers.readApiOptions(io, command, { includeStoredToken: false });
      const token = await helpers.readStoredToken(io, baseUrl);
      const status = {
        apiUrl: baseUrl,
        credentialPath: helpers.credentialPath(io),
        hasToken: Boolean(token)
      };

      if (options.json) {
        helpers.writeOutput(io, status);
        return;
      }

      io.stdout(token ? `Stored Muse API token for ${baseUrl}\n` : `No stored Muse API token for ${baseUrl}\n`);
    });

  auth
    .command("logout")
    .description("Remove the stored bearer token for the active API URL")
    .action(async (_options, command) => {
      const { baseUrl } = await helpers.readApiOptions(io, command, { includeStoredToken: false });
      await helpers.deleteStoredToken(io, baseUrl);
      io.stdout(`Removed Muse API token for ${baseUrl}\n`);
    });

  // Goal 082 — operator-driven JWT secret rotation. Writes a new
  // 32-byte hex secret to ~/.muse/auth-secrets.json, pushes the
  // old one onto the grace-window list with a validUntil =
  // now + --grace-hours (default 24). The runtime reads the file
  // at boot (env stays the fallback when the file is missing).
  // Operator restarts the server after rotating; live reload is
  // a follow-up (no file-watch hook exists today).
  auth
    .command("rotate-jwt")
    .description("Generate a fresh JWT signing secret and grace-window the old one (goal 082)")
    .option("--grace-hours <n>", "Hours the old secret keeps verifying tokens (default 24)")
    .option("--json", "Emit the new state as JSON (secrets included — pipe to a file you keep safe)")
    .action(async (options: { readonly graceHours?: string; readonly json?: boolean }) => {
      const file = defaultAuthSecretsFile();
      const graceHours = options.graceHours ? Number.parseFloat(options.graceHours) : 24;
      if (!Number.isFinite(graceHours) || graceHours < 0) {
        io.stderr("--grace-hours must be a non-negative number\n");
        process.exitCode = 1;
        return;
      }
      const existing = await readJwtRotationState(file);
      const fallbackCurrent = process.env.MUSE_AUTH_JWT_SECRET?.trim();
      const next = rotateJwtState({
        state: existing,
        ...(fallbackCurrent ? { fallbackCurrent } : {}),
        now: new Date(),
        graceMs: graceHours * 60 * 60 * 1000
      });
      await writeJwtRotationState(file, next);
      if (options.json) {
        io.stdout(`${JSON.stringify(next, null, 2)}\n`);
        return;
      }
      const graceMins = Math.round(graceHours * 60);
      const prevCount = next.previous.length;
      io.stdout(`Rotated JWT secret. New "current" written to ${file}.\n`);
      io.stdout(`  Grace window: ${graceMins.toString()} min — ${prevCount.toString()} previous secret(s) still verify.\n`);
      io.stdout(`Restart the Muse server (or your daemon manager) so the new secret takes effect.\n`);
    });
}
