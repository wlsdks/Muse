/**
 * Load the swarm peer config (`~/.muse/a2a-peers.json`) into a registry.
 *
 *   { "selfId": "my-laptop",
 *     "peers": [ { "id": "my-phone", "url": "https://…/a2a", "secret": "…", "label": "phone" } ] }
 *
 * `selfId` is who this Muse is in the swarm (the outbound `fromPeerId`); `peers`
 * is the allowlist. Tolerant: a missing / malformed file yields an empty
 * registry (no peer → nothing sends, nothing is accepted).
 */

import { promises as fs } from "node:fs";

import { createPeerRegistry, type A2APeer, type PeerRegistry } from "./peer-registry.js";

export interface PeerConfig {
  readonly selfId: string;
  readonly registry: PeerRegistry;
  readonly peers: readonly A2APeer[];
}

function isPeer(value: unknown): value is A2APeer {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === "string" && p.id.length > 0
    && typeof p.url === "string" && p.url.length > 0
    && typeof p.secret === "string" && p.secret.length > 0;
}

export async function loadPeerConfig(file: string): Promise<PeerConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { peers: [], registry: createPeerRegistry([]), selfId: "" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { peers: [], registry: createPeerRegistry([]), selfId: "" };
  }
  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as { selfId?: unknown; peers?: unknown };
  const selfId = typeof obj.selfId === "string" ? obj.selfId : "";
  const peers = Array.isArray(obj.peers) ? obj.peers.filter(isPeer) : [];
  return { peers, registry: createPeerRegistry(peers), selfId };
}
