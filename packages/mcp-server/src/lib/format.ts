/** 289900 -> "₹2,899.00", using Indian digit grouping. */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const rupees = Math.trunc(Math.abs(paise) / 100);
  const fraction = String(Math.abs(paise) % 100).padStart(2, "0");
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${sign}₹${grouped}.${fraction}`;
}

/**
 * Every tool answers as one JSON document.
 *
 * MCP clients read tool output as text, and a model reasoning over a shaped
 * object makes far fewer mistakes than one parsing prose.
 */
export function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

/** A tool failure the client should see and act on, not a protocol error. */
export function errorResult(message: string, extra: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message, ...extra }, null, 2) }],
    isError: true,
  };
}
