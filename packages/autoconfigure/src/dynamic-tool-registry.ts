/**
 * `DynamicToolRegistry` — a small `ToolRegistry` subclass that merges
 * statically-registered tools with lazy "source" functions that may
 * return different tool sets over time (e.g., loopback MCP servers
 * that gain or lose tools as the messaging registry's provider list
 * changes).
 *
 * Extracted from `index.ts` to keep that file focused on the runtime
 * + API-options assembly factories; this class has no env-driven
 * configuration logic of its own.
 */

import { ToolRegistry, type MuseTool } from "@muse/tools";

export class DynamicToolRegistry extends ToolRegistry {
  constructor(private readonly sources: readonly (() => readonly MuseTool[])[]) {
    super();
  }

  override get(name: string): MuseTool | undefined {
    return super.get(name) ?? this.dynamicTools().find((tool) => tool.definition.name === name);
  }

  override list(): readonly MuseTool[] {
    const builtin = super.list();
    const builtinNames = new Set(builtin.map((tool) => tool.definition.name));
    // `get()` resolves a colliding name to the built-in, so `list()` must
    // agree: drop a dynamic tool whose name shadows a built-in. Otherwise the
    // name appears TWICE in the projected tool list, and most providers
    // (OpenAI/Anthropic) reject duplicate function names outright.
    return [...builtin, ...this.dynamicTools().filter((tool) => !builtinNames.has(tool.definition.name))];
  }

  private dynamicTools(): readonly MuseTool[] {
    const byName = new Map<string, MuseTool>();

    for (const source of this.sources) {
      for (const tool of source()) {
        byName.set(tool.definition.name, tool);
      }
    }

    return [...byName.values()];
  }
}
