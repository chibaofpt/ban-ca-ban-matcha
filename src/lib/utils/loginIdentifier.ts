export type LoginIdentifier =
  | { kind: "phone"; value: string }
  | { kind: "instagram"; value: string };

/** Classify a single login field as phone or Instagram. */
export function classifyLoginIdentifier(input: string): LoginIdentifier {
  const trimmed = input.trim();
  if (trimmed.startsWith("@")) {
    return {
      kind: "instagram",
      value: trimmed.slice(1).trim().toLowerCase(),
    };
  }

  const compactPhone = trimmed.replace(/\s+/g, "");
  if (/^(0|\+84)\d{9}$/.test(compactPhone)) {
    return { kind: "phone", value: compactPhone };
  }

  return { kind: "instagram", value: trimmed.toLowerCase() };
}
