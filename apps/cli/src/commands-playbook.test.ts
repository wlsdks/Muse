import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerPlaybookCommands } from "./commands-playbook.js";

type IO = Parameters<typeof registerPlaybookCommands>[1];
const noopIo = { stderr: () => undefined, stdout: () => undefined } as unknown as IO;

function findSub(program: Command, names: readonly string[]): Command | undefined {
  let current: Command | undefined = program;
  for (const name of names) {
    current = current?.commands.find((command) => command.name() === name);
  }
  return current;
}

describe("muse playbook command registration", () => {
  it("registers the distill subcommand (ReasoningBank slice 2)", () => {
    const program = new Command();
    registerPlaybookCommands(program, noopIo);
    const distill = findSub(program, ["playbook", "distill"]);
    expect(distill).toBeDefined();
    expect(distill?.description()).toContain("last chat session");
  });

  it("keeps add/list/remove alongside distill", () => {
    const program = new Command();
    registerPlaybookCommands(program, noopIo);
    for (const name of ["add", "list", "remove", "distill"]) {
      expect(findSub(program, ["playbook", name])).toBeDefined();
    }
  });
});
