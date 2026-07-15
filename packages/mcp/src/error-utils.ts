import { errorMessage } from "@muse/shared";

export function toErrorMessage(error: unknown): string {
  return errorMessage(error);
}
