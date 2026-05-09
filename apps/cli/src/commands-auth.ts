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
}
