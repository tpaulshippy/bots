/**
 * Pull the first message for a field out of a DRF 400 body, where each
 * field's errors may be a single string or a list of strings.
 */
export const fieldMessage = (body: unknown, field: string): string | null => {
  if (!body || typeof body !== "object") {
    return null;
  }
  const value = (body as Record<string, unknown>)[field];
  if (typeof value === "string" && value) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    );
    return first ?? null;
  }
  return null;
};
