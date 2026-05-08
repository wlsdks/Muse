/**
 * Slack mrkdwn renderer extracted from packages/integrations/src/index.ts.
 *
 * Owns the public `formatSlackMrkdwn` entrypoint plus every regex,
 * decorative-emoji list, and helper used to convert internal Markdown
 * into Slack mrkdwn — code-fence preservation, table → bullet lift,
 * heading rewrites, decorative-emoji stripping, raw user-id wrapping,
 * heading/bullet spacing, consecutive-duplicate paragraph dedup, and
 * the `formatSlackPayload` helper that lifts mrkdwn formatting onto
 * a Slack response payload's `text` field.
 *
 * Re-exported from the integrations barrel for backwards compatibility.
 */

import type { JsonObject } from "@muse/shared";

const slackBoldPattern = /\*\*([^*\n]*[a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ][^*\n]*)\*\*/gu;
const slackHeaderPattern = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gmu;
const slackLinkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gu;
const slackHorizontalRulePattern = /^\s*([-*_])\1{2,}\s*$/gmu;
const slackExcessiveNewlinesPattern = /\n{3,}/gu;
const slackMultipleSpacesPattern = / {2,}/gu;
const slackLeadingSpacesPattern = /^ +/gmu;
const slackHeadingLinePattern = /^\s*\*[^*\n]{1,80}\*\s*$/u;
const slackBulletLinePattern = /^\s*[•\-*]\s+\S/u;
const slackTableSeparatorCellPattern = /^:?-{3,}:?$/u;
const slackInlineBacktickPattern = /`(?!U[A-Z0-9]{8,}`)[^`\n]{1,500}`/gu;
const slackInlineBacktickPlaceholderPattern = /BT(\d+)/gu;
const slackRawUserIdPattern = /(?<![@\w])`?(U[A-Z0-9]{8,})`?(?![A-Za-z0-9])/gu;
const slackSystemMetaLeakPattern =
  /^\s*(?:\[SYSTEM_META[^\n\]]*\][^\n]*|\(이 메시지의 발화자:[^)\n]*\)|\[현재 발화자=[^\n\]]*\][^\n]*)\s*$/gmu;
const slackLeadingGreetingPattern =
  /^(안녕하세요|안녕|반가워요|반갑습니다|반갑네요|하이)[,，]?\s*[^\n!?.]{0,25}[님씨][!?.]\s*/u;
const slackFollowupGreetingPattern = /^(반갑습니다|반가워요|반갑네요|좋은\s*아침이에요|좋은\s*저녁이에요)[!?.]\s*/u;
const slackInternalBrandPatterns: ReadonlyArray<readonly [RegExp, string]> = [
  [/\*\*?Reactor\s*\(\s*Reactor\s*\)\*\*?/gu, "*Reactor*"],
  [/Reactor\s*\(\s*Reactor\s*\)/gu, "Reactor"]
];
const slackDecorativeEmojis = [
  "📋",
  "💡",
  "🚀",
  "📌",
  "📄",
  "🔀",
  "📝",
  "✨",
  "🎯",
  "🎉",
  "😊",
  "😃",
  "😄",
  "😁",
  "🙂",
  "😉",
  "🥰",
  "🤗",
  "😇",
  "😂",
  "🤣",
  "😅",
  "😆",
  "😋",
  "😎",
  "😢",
  "😭",
  "😔",
  "😴",
  "🔥",
  "👏",
  "👍",
  "💪",
  "🙌",
  "🤝",
  "👀",
  "💭",
  "☀️",
  "⭐",
  "🌟",
  "🌈",
  "🎊",
  "🎁",
  "🙏",
  "🔍",
  "🤔",
  "🍶",
  "🍺",
  "🍻",
  "🍷",
  "🥃",
  "🍴",
  "🍽",
  "🍕",
  "🍔",
  "🍟",
  "🍗",
  "🍖",
  "🍚",
  "🍜",
  "🍝",
  "🍛",
  "🍙",
  "🍘",
  "🍢",
  "🍡",
  "☕",
  "🍵",
  "🥤",
  "🧋",
  "🍰",
  "🍩",
  "🍪",
  "🍫",
  "🍬",
  "🍭",
  "💬",
  "📱",
  "💻",
  "🖥",
  "⌨",
  "🖱",
  "🗂",
  "📊",
  "📈",
  "📉",
  "💨",
  "🏃",
  "🏃‍♂️",
  "🏃‍♀️",
  "🚶",
  "🏠",
  "🛋",
  "🛌",
  "⏰",
  "🎈",
  "💯",
  "💥",
  "🌸",
  "🎀",
  "💐",
  "🌺",
  "🌻"
] as const;

export function formatSlackMrkdwn(content: string): string {
  if (content.trim().length === 0) {
    return content;
  }

  return splitSlackCodeFenceSegments(content)
    .map((segment) => (segment.isCode ? segment.text : transformSlackNonCodeText(segment.text)))
    .join("");
}

export function formatSlackPayload(body: JsonObject): JsonObject {
  const text = body.text;

  if (typeof text !== "string") {
    return body;
  }

  return {
    ...body,
    text: formatSlackMrkdwn(text)
  };
}

function transformSlackNonCodeText(text: string): string {
  const protectedBackticks: string[] = [];
  const hadTrailingNewline = text.endsWith("\n");
  let result = text.replace(slackInlineBacktickPattern, (match) => {
    protectedBackticks.push(match);
    return `BT${protectedBackticks.length - 1}`;
  });

  result = result.replace(slackSystemMetaLeakPattern, "");
  result = result.replace(slackLeadingGreetingPattern, "");
  result = result.replace(slackFollowupGreetingPattern, "");

  for (const [pattern, replacement] of slackInternalBrandPatterns) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(slackBoldPattern, (_match, inner: string) => `*${inner}*`);
  result = result.replace(slackHeaderPattern, (_match, inner: string) => `*${inner.replace(/^\*+|\*+$/gu, "").trim()}*`);
  result = convertSlackTables(result);
  result = result.replace(slackLinkPattern, (_match, label: string, url: string) => `<${url}|${label}>`);
  result = result.replace(slackHorizontalRulePattern, "");
  result = stripSlackDecorativeEmojis(result);
  result = result.replace(slackRawUserIdPattern, (_match, id: string) => `<@${id}>`);
  result = ensureSlackHeadingSpacing(result);
  result = result.replace(slackExcessiveNewlinesPattern, "\n\n").trim();
  if (hadTrailingNewline && result.length > 0) {
    result += "\n";
  }
  result = removeConsecutiveDuplicateSlackParagraphs(result);
  result = result.replace(slackInlineBacktickPlaceholderPattern, (match, index: string) => {
    const parsed = Number.parseInt(index, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed < protectedBackticks.length
      ? protectedBackticks[parsed] ?? match
      : match;
  });

  return result;
}

function convertSlackTables(content: string): string {
  const lines = content.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const headerLine = lines[index] ?? "";
    const separatorLine = lines[index + 1];

    if (isSlackTableRow(headerLine) && separatorLine !== undefined && isSlackTableSeparator(separatorLine)) {
      const headers = splitSlackTableCells(headerLine);
      let rowIndex = index + 2;

      while (rowIndex < lines.length && isSlackTableRow(lines[rowIndex] ?? "")) {
        const cells = splitSlackTableCells(lines[rowIndex] ?? "");
        const row = cells
          .map((cell, cellIndex) => {
            const value = cell.trim();
            const header = headers[cellIndex]?.trim() ?? "";

            if (value.length === 0) {
              return undefined;
            }

            return header.length > 0 ? `*${header}*: ${value}` : value;
          })
          .filter((cell): cell is string => cell !== undefined)
          .join(" — ");

        output.push(`• ${row}`);
        rowIndex += 1;
      }

      index = rowIndex;
      continue;
    }

    output.push(headerLine);
    index += 1;
  }

  return output.join("\n").replace(/\n+$/u, "");
}

function ensureSlackHeadingSpacing(text: string): string {
  const lines = text.split("\n");
  let output = "";

  lines.forEach((line, index) => {
    const isHeading = slackHeadingLinePattern.test(line);
    const isBullet = slackBulletLinePattern.test(line);
    const previousLine = index > 0 ? lines[index - 1] ?? "" : "";
    const previousIsBullet = slackBulletLinePattern.test(previousLine);

    if (isHeading && output.length > 0 && !output.endsWith("\n\n")) {
      output += output.endsWith("\n") ? "\n" : "\n\n";
    }

    if (isBullet && !previousIsBullet && previousLine.trim().length > 0 && output.length > 0 && !output.endsWith("\n\n")) {
      output += output.endsWith("\n") ? "\n" : "\n\n";
    }

    output += line;

    if (index < lines.length - 1) {
      output += "\n";
    }

    if (isHeading && index < lines.length - 1 && (lines[index + 1] ?? "").trim().length > 0) {
      output += "\n";
    }

    const nextLine = index < lines.length - 1 ? lines[index + 1] ?? "" : "";
    const nextIsBullet = slackBulletLinePattern.test(nextLine);

    if (isBullet && index < lines.length - 1 && !nextIsBullet && nextLine.trim().length > 0) {
      output += "\n";
    }
  });

  return output;
}

function stripSlackDecorativeEmojis(text: string): string {
  let result = text;

  for (const emoji of slackDecorativeEmojis) {
    result = result.split(`${emoji} `).join("");
    result = result.split(emoji).join("");
  }

  return result.replace(slackMultipleSpacesPattern, " ").replace(slackLeadingSpacesPattern, "");
}

function removeConsecutiveDuplicateSlackParagraphs(text: string): string {
  const paragraphs = text.split("\n\n");

  if (paragraphs.length < 2) {
    return text;
  }

  const output: string[] = [];
  let previousKey: string | undefined;

  for (const paragraph of paragraphs) {
    const key = paragraph.trim();

    if (key.length > 0 && key === previousKey) {
      continue;
    }

    output.push(paragraph);

    if (key.length > 0) {
      previousKey = key;
    }
  }

  return output.join("\n\n");
}

function isSlackTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && countOccurrences(trimmed, "|") >= 3;
}

function isSlackTableSeparator(line: string): boolean {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");

  if (trimmed.length === 0) {
    return false;
  }

  return trimmed.split("|").every((cell) => slackTableSeparatorCellPattern.test(cell.trim()));
}

function splitSlackTableCells(line: string): readonly string[] {
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function splitSlackCodeFenceSegments(content: string): Array<{ readonly isCode: boolean; readonly text: string }> {
  const segments: Array<{ readonly isCode: boolean; readonly text: string }> = [];
  const lines = content.split("\n");
  let buffer = "";
  let inCode = false;

  lines.forEach((line, index) => {
    const hasNextLine = index < lines.length - 1;

    if (line.trim().startsWith("```")) {
      if (buffer.length > 0) {
        segments.push({ isCode: inCode, text: buffer });
        buffer = "";
      }

      buffer += line;

      if (hasNextLine) {
        buffer += "\n";
      }

      segments.push({ isCode: true, text: buffer });
      buffer = "";
      inCode = !inCode;
      return;
    }

    buffer += line;

    if (hasNextLine) {
      buffer += "\n";
    }
  });

  if (buffer.length > 0) {
    segments.push({ isCode: inCode, text: buffer });
  }

  return segments;
}
