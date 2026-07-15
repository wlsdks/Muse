/**
 * Shared Notion HTTP + response-shape primitives used by BOTH the Notion
 * notes provider and the Notion tasks provider — a single source of truth
 * for the api.notion.com endpoint/version defaults, the transient-status
 * retry classification, the error-code mapping, and the page-shape value
 * extractors that were previously hand-duplicated in each provider file.
 */

import { isRecord } from "@muse/shared";

export const NOTION_DEFAULT_ENDPOINT = "https://api.notion.com/v1";
export const NOTION_DEFAULT_VERSION = "2022-06-28";
export const NOTION_DEFAULT_TITLE_PROPERTY = "Name";
export const NOTION_LIST_MAX_PAGES = 10;

export function isTransientNotionStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function mapNotionStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "NOTION_AUTH";
  }
  if (status === 404) {
    return "NOTION_NOT_FOUND";
  }
  if (status === 429) {
    return "NOTION_RATE_LIMIT";
  }
  return `HTTP_${status}`;
}

export function isRecordArray(body: unknown, key: string): readonly unknown[] {
  if (!isRecord(body)) {
    return [];
  }
  const value = body[key];
  return Array.isArray(value) ? value : [];
}

export function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function readRecordField(record: unknown, key: string): Record<string, unknown> | undefined {
  const value = toRecord(record)?.[key];
  return isRecord(value) ? value : undefined;
}

export function readStringField(record: unknown, key: string): string | undefined {
  const value = toRecord(record)?.[key];
  return typeof value === "string" ? value : undefined;
}

export function readBooleanField(record: unknown, key: string): boolean | undefined {
  const value = toRecord(record)?.[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readArrayField(record: unknown, key: string): readonly unknown[] | undefined {
  const value = toRecord(record)?.[key];
  return Array.isArray(value) ? value : undefined;
}

export function extractTitleString(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const titleArr = value.title;
  if (!Array.isArray(titleArr)) {
    return undefined;
  }
  const text = titleArr
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      if (!isRecord(entry)) {
        return "";
      }
      const plain = readStringField(entry, "plain_text");
      if (plain !== undefined) {
        return plain;
      }
      const textBlock = readRecordField(entry, "text");
      return typeof textBlock?.content === "string" ? textBlock.content : "";
    })
    .join("");
  return text.length > 0 ? text : undefined;
}
