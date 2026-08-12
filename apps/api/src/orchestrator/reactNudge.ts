export function stillNeedsTools(
  allowed: string[],
  toolsCalled: string[],
  terminal: Set<string>,
): boolean {
  if (terminal.size > 0) {
    return !toolsCalled.some((t) => terminal.has(t));
  }
  return allowed.some((t) => !toolsCalled.includes(t));
}

export function nudgeForMissingTools(
  allowed: string[],
  toolsCalled: string[],
  terminal: Set<string>,
): string {
  if (terminal.size > 0) {
    const needed = [...terminal].filter((t) => !toolsCalled.includes(t));
    return [
      "Do not reply with plain text. You must invoke tools via function calling.",
      `Call one of these required tools now: ${needed.join(", ")}.`,
      "Listing tool names in prose does not count.",
    ].join(" ");
  }
  const missing = allowed.filter((t) => !toolsCalled.includes(t));
  return [
    "Do not reply with plain text. You must invoke tools via function calling.",
    `Still need function calls for: ${missing.join(", ")}.`,
    "Listing tool names in prose does not count — emit functionCall parts.",
  ].join(" ");
}
