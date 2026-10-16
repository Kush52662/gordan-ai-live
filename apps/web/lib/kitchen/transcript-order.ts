type Message = {
  id: string;
  timestamp: number;
  message: string;
  attributes?: Record<string, string>;
};
type Stream = {
  streamInfo: { id: string; timestamp: number; attributes?: Record<string, string> };
  firstReceivedTime?: number;
};

// Room transcriptions share the agent's clock. Chat uses the browser clock.
// Retain one offset for the session, rather than measuring transcript delivery delay
// again for each message (Gemini may send the user's text after the reply).
export class TranscriptTimeline {
  private clockOffset: number | undefined;

  order<T extends Message>(messages: T[], streams: Stream[]): T[] {
    const first = streams.find((stream) => Number.isFinite(stream.firstReceivedTime));
    if (this.clockOffset === undefined && first) {
      this.clockOffset = first.firstReceivedTime! - first.streamInfo.timestamp;
    }
    const byId = new Map(streams.map((stream) => [stream.streamInfo.id, stream]));
    const normalized = messages
      .filter((message) => message.message.trim())
      .map((message) => {
        const stream = byId.get(message.id);
        if (!stream) return message;
        const attributes = { ...message.attributes, ...stream.streamInfo.attributes };
        const startedAt = Number(attributes['gordon.turn_started_at']);
        const serverTime =
          Number.isFinite(startedAt) && startedAt > 0 ? startedAt : stream.streamInfo.timestamp;
        const id = attributes['gordon.input_item_id'] ?? attributes['lk.segment_id'] ?? message.id;
        return {
          ...message,
          id,
          attributes: { ...attributes, 'lk.segment_id': id },
          timestamp: serverTime + (this.clockOffset ?? 0),
        };
      });
    // An interim and its final stream must remain one bubble even when their
    // transport stream IDs differ. Later updates replace text without moving it.
    return [...new Map(normalized.map((message) => [message.id, message])).values()].sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }
}
