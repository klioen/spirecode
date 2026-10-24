export const MAX_DETAIL_CHARACTERS = 16_000;

export interface DisplayDetail {
  text: string;
  truncated: boolean;
}

export function displayDetail(value: unknown): DisplayDetail | null {
  if (value === undefined) return null;
  let serialized: string;
  if (typeof value === "string") {
    serialized = value;
  } else {
    try {
      const json = JSON.stringify(value, null, 2);
      serialized = json === undefined ? String(value) : json;
    } catch {
      serialized = String(value);
    }
  }
  return {
    text: serialized.slice(0, MAX_DETAIL_CHARACTERS),
    truncated: serialized.length > MAX_DETAIL_CHARACTERS,
  };
}
