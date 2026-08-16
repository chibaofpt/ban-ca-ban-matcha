export interface AdaptiveSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleLowerCase("vi")
    .trim();
}

/** Filters select options with accent-insensitive matching. */
export function filterAdaptiveOptions(
  options: AdaptiveSelectOption[],
  query: string,
): AdaptiveSelectOption[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return options;
  return options.filter((option) =>
    normalizeSearch(`${option.label} ${option.description ?? ""}`).includes(normalizedQuery),
  );
}

/** Returns the next controlled value for single or multiple selection. */
export function toggleAdaptiveValue(
  selected: string[],
  value: string,
  multiple: boolean,
): string[] {
  if (!multiple) return [value];
  return selected.includes(value)
    ? selected.filter((selectedValue) => selectedValue !== value)
    : [...selected, value];
}
