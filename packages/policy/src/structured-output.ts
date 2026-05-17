export type StructuredOutputFormat = "json" | "yaml";

export interface StructuredOutputNormalizationResult {
  readonly content: string;
  readonly normalized: boolean;
  readonly error?: string;
}

export function normalizeStructuredOutput(
  content: string,
  format: StructuredOutputFormat
): StructuredOutputNormalizationResult {
  if (format === "json") {
    return normalizeJsonOutput(content);
  }

  return normalizeYamlOutput(content);
}

function normalizeJsonOutput(content: string): StructuredOutputNormalizationResult {
  const candidate = extractJsonCandidate(stripMarkdownFence(content));

  if (!candidate) {
    return { content, error: "No JSON object or array found", normalized: false };
  }

  try {
    return {
      content: JSON.stringify(JSON.parse(candidate), null, 2),
      normalized: true
    };
  } catch (error) {
    return {
      content,
      error: error instanceof Error ? error.message : "Invalid JSON",
      normalized: false
    };
  }
}

function normalizeYamlOutput(content: string): StructuredOutputNormalizationResult {
  const stripped = stripMarkdownFence(content).trim();

  if (stripped.length === 0) {
    return { content, error: "No YAML content found", normalized: false };
  }

  return {
    content: stripped,
    normalized: stripped !== content
  };
}

function stripMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:json|ya?ml)?\s*\n(?<body>[\s\S]*?)\n```\s*$/iu);
  return match?.groups?.body ?? trimmed;
}

function extractJsonCandidate(content: string): string | undefined {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const objectIndex = trimmed.indexOf("{");
  const arrayIndex = trimmed.indexOf("[");
  const start = [objectIndex, arrayIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (start === undefined) {
    return undefined;
  }

  // First *balanced* value from the opener, not first-opener →
  // last-closer: a small model trailing an example/note (e.g.
  // `{...} note: {...}`) made the crude span engulf prose and
  // fail to parse, silently rejecting a valid structured answer.
  return firstBalancedJsonBlock(trimmed, start);
}

function firstBalancedJsonBlock(input: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < input.length; index += 1) {
    const ch = input[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }
  return undefined;
}
