import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LogMessagingProvider, MessagingValidationError } from "../src/index.js";

async function newProvider() {
  const dir = await mkdtemp(join(tmpdir(), "muse-log-prov-"));
  const file = join(dir, "notifications.log");
  return { dir, file, provider: new LogMessagingProvider({ file, now: () => new Date("2026-05-12T10:00:00Z") }) };
}

describe("LogMessagingProvider", () => {
  it("appends each send to the configured log file", async () => {
    const { file, provider } = await newProvider();
    await provider.send({ destination: "@stark", text: "first message" });
    await provider.send({ destination: "@stark", text: "second message" });
    const contents = await readFile(file, "utf8");
    expect(contents).toContain("(@stark) first message");
    expect(contents).toContain("(@stark) second message");
    expect(contents.split("\n").filter((line) => line.length > 0)).toHaveLength(2);
  });

  it("includes the timestamp prefix so a tail -f reads like a log", async () => {
    const { file, provider } = await newProvider();
    await provider.send({ destination: "@stark", text: "hi" });
    const contents = await readFile(file, "utf8");
    expect(contents.startsWith("[2026-05-12T10:00:00.000Z]")).toBe(true);
  });

  it("returns a receipt with provider id, destination, and a stable messageId", async () => {
    const { provider } = await newProvider();
    const receipt = await provider.send({ destination: "@stark", text: "hello" });
    expect(receipt.providerId).toBe("log");
    expect(receipt.destination).toBe("@stark");
    expect(receipt.messageId).toBe("log-2026-05-12T10:00:00.000Z");
  });

  it("rejects empty text via the shared validateOutboundMessage", async () => {
    const { provider } = await newProvider();
    await expect(provider.send({ destination: "@stark", text: "" })).rejects.toBeInstanceOf(MessagingValidationError);
  });

  it("rejects empty destination", async () => {
    const { provider } = await newProvider();
    await expect(provider.send({ destination: "", text: "hello" })).rejects.toBeInstanceOf(MessagingValidationError);
  });

  it("creates the parent directory on demand", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-log-prov-mkdir-"));
    const file = join(dir, "deep", "nested", "notifications.log");
    const provider = new LogMessagingProvider({ file });
    await provider.send({ destination: "@stark", text: "hi" });
    const contents = await readFile(file, "utf8");
    expect(contents).toContain("(@stark) hi");
  });

  it("describes itself as local with a file hint", () => {
    const provider = new LogMessagingProvider({ file: "/tmp/x.log" });
    const info = provider.describe();
    expect(info.id).toBe("log");
    expect(info.local).toBe(true);
    expect(info.description).toContain("/tmp/x.log");
  });
});
