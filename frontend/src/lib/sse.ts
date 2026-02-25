/**
 * Shared SSE (Server-Sent Events) parsing utilities.
 *
 * Used by both `useStreamingResponse` (for /api/chat/stream) and
 * `respondToClarification` in ChatContext (for /api/chat/clarify).
 */

/** A parsed SSE event with its type and payload. */
export interface ParsedSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Parse a single SSE event block (the text between double newlines)
 * into a structured event object.
 *
 * Expects the SSE format used by the ITOM backend:
 *   `data: {"event": "token", "data": {"token": "hello"}}`
 *
 * Returns `null` if the block does not contain a valid `data:` line.
 */
export function parseSSEEvent(block: string): ParsedSSEEvent | null {
  const trimmed = block.trim();
  if (!trimmed || !trimmed.startsWith('data: ')) return null;

  const jsonStr = trimmed.slice(6); // Remove "data: " prefix
  try {
    return JSON.parse(jsonStr) as ParsedSSEEvent;
  } catch {
    return null;
  }
}

/**
 * Split an SSE buffer on double-newline boundaries and parse each event.
 *
 * Returns the parsed events and any remaining incomplete buffer text.
 *
 * @param buffer - The accumulated SSE text (may contain multiple events).
 * @returns An object with `events` (parsed) and `remaining` (leftover buffer).
 */
export function parseSSEBuffer(buffer: string): {
  events: ParsedSSEEvent[];
  remaining: string;
} {
  const chunks = buffer.split('\n\n');
  const remaining = chunks.pop() ?? '';

  const events: ParsedSSEEvent[] = [];
  for (const chunk of chunks) {
    // Each chunk may have multiple lines; find the data line
    for (const line of chunk.split('\n')) {
      const parsed = parseSSEEvent(line);
      if (parsed) {
        events.push(parsed);
        break; // One event per chunk
      }
    }
  }

  return { events, remaining };
}
