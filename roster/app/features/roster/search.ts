/**
 * Name search over the shift grids (`/e/:id/roster`, `/r/:viewToken`). Pure —
 * no D1, no React — so the matching rule is testable on its own and both the
 * staff view and the role view highlight exactly the same set of people.
 *
 * Whitespace is stripped from BOTH sides of the comparison, not just trimmed
 * at the ends: staff names are stored with an inner space (`佐藤 陽菜`), and
 * someone searching for a person types their name the way they say it
 * (`佐藤陽菜`) at least as often as the way it was registered.
 */

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "");
}

/**
 * Application ids whose name contains `query`.
 *
 * An empty (or whitespace-only) query returns an EMPTY set, never "all" —
 * the result feeds a highlight, and highlighting every row when the box is
 * empty would be the opposite of what the control is for.
 */
export function matchStaffIds(
  query: string,
  staff: Iterable<{ id: string; name: string }>,
): Set<string> {
  const needle = normalizeName(query);
  const matched = new Set<string>();
  if (!needle) return matched;
  for (const person of staff) {
    if (normalizeName(person.name).includes(needle)) matched.add(person.id);
  }
  return matched;
}
