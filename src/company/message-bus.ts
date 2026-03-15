import type { AgentMessage } from "./types.js";

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type MessageHandler = (msg: AgentMessage) => void;

/**
 * In-process inter-agent message routing.
 * Messages are emitted via the broadcast callback to WebSocket clients.
 */
export class MessageBus {
  private handlers: MessageHandler[] = [];
  private history: AgentMessage[] = [];
  private readonly maxHistory = 500;

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(
    from: string,
    to: string,
    content: string,
    type: AgentMessage["type"] = "notify",
  ): AgentMessage {
    const msg: AgentMessage = {
      id: generateId(),
      from,
      to,
      content,
      type,
      ts: Date.now(),
    };
    this.history.push(msg);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    for (const h of this.handlers) {
      try {
        h(msg);
      } catch {
        // ignore handler errors
      }
    }
    return msg;
  }

  getHistory(opts?: {
    from?: string;
    to?: string;
    participants?: string[];
    limit?: number;
  }): AgentMessage[] {
    let result = this.history;
    if (opts?.participants && opts.participants.length > 0) {
      const participants = new Set(opts.participants);
      result = result.filter((m) => participants.has(m.from) || participants.has(m.to));
    }
    if (opts?.from) {
      result = result.filter((m) => m.from === opts.from);
    }
    if (opts?.to) {
      result = result.filter((m) => m.to === opts.to);
    }
    if (opts?.limit) {
      result = result.slice(-opts.limit);
    }
    return result;
  }
}
