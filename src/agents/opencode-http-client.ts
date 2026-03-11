export class OpenCodeServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeServiceUnavailableError";
  }
}

export interface SendMessageOptions {
  model: { providerID: string; modelID: string };
  system?: string;
  format?: { type: "json_schema"; schema: object };
  parts: Array<{ type: "text"; text: string }>;
}

interface SessionResponse {
  id: string;
}

interface MessagePart {
  type: string;
  text?: string;
  synthetic?: boolean;
}

interface MessageResponse {
  info?: {
    structured?: unknown;
    error?: unknown;
  };
  parts?: MessagePart[];
}

export class OpenCodeHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly directory: string,
  ) {}

  async createSession(): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/session`, {
        method: "POST",
        headers: {
          "x-opencode-directory": this.directory,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
    } catch (err) {
      throw new OpenCodeServiceUnavailableError(
        `OpenCode service unavailable: ${String(err)}`,
      );
    }

    if (!res.ok) {
      throw new Error(`createSession failed with status ${res.status}`);
    }

    const data = (await res.json()) as SessionResponse;
    return data.id;
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/session/${sessionId}`, {
        method: "DELETE",
        headers: {
          "x-opencode-directory": this.directory,
        },
      });
      // Best-effort: ignore errors (race conditions are known, session will be GC'd by OpenCode)
    } catch {
      // ignore
    }
  }

  async sendMessage(
    sessionId: string,
    opts: SendMessageOptions,
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-opencode-directory": this.directory,
        },
        body: JSON.stringify(opts),
      });
    } catch (err) {
      throw new OpenCodeServiceUnavailableError(
        `OpenCode service unavailable: ${String(err)}`,
      );
    }

    if (!res.ok) {
      throw new Error(`sendMessage failed with status ${res.status}`);
    }

    const data = (await res.json()) as MessageResponse;

    // Fast-fail on provider/API errors instead of returning null and waiting for timeout.
    // OpenCode returns HTTP 200 even when the underlying LLM call fails; the error is in info.error.
    if (data.info?.error) {
      const errData = (data.info.error as Record<string, unknown>).data as Record<string, unknown> | undefined;
      const message = (errData?.message as string | undefined) ?? JSON.stringify(data.info.error);
      throw new Error(`Provider error: ${message}`);
    }

    if (opts.format !== undefined) {
      // Primary path: structured output captured by OpenCode's StructuredOutput tool
      if (data.info?.structured !== undefined) {
        return data.info.structured;
      }
      // Fallback: model returned text instead of using the StructuredOutput tool.
      // Try to find and parse JSON from any text or reasoning part.
      const parts = data.parts ?? [];
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part.text !== undefined) {
          const extracted = extractJsonFromText(part.text);
          if (extracted !== null) {
            return extracted;
          }
        }
      }
      // Log the raw response structure so we can debug further
      console.error("[opencode-http-client] json_schema format requested but no structured output found.");
      console.error("[opencode-http-client] info.structured:", JSON.stringify(data.info?.structured));
      console.error("[opencode-http-client] parts count:", (data.parts ?? []).length);
      return null;
    }

    // Find last usable text part.
    // Pass 1: prefer non-synthetic text parts (cleaner response without tool scaffolding)
    // Pass 2: fall back to synthetic text parts (lilith provider marks assistant text as synthetic)
    const parts = data.parts ?? [];
    console.error("[opencode-http-client] text path: parts count:", parts.length);
    if (parts.length > 0) {
      console.error("[opencode-http-client] parts summary:", JSON.stringify(parts.map(p => ({ type: p.type, synthetic: p.synthetic, textLen: p.text?.length ?? 0 }))));
    }

    // Pass 1: non-synthetic
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.type === "text" && part.synthetic !== true && part.text !== undefined) {
        console.error("[opencode-http-client] returning non-synthetic text part, len:", part.text.length, "preview:", part.text.slice(0, 200));
        return part.text;
      }
    }

    // Pass 2: accept synthetic text parts (lilith/remote providers may mark response as synthetic)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.type === "text" && part.text !== undefined) {
        console.error("[opencode-http-client] returning synthetic text part, len:", part.text.length, "preview:", part.text.slice(0, 200));
        return part.text;
      }
    }

    console.error("[opencode-http-client] no usable text part found. info:", JSON.stringify(data.info));
    return null;
  }

  static async discoverUrl(): Promise<string> {
    // Priority 1: explicit env var (most reliable, user-configured)
    const envUrl = process.env["OPENCODE_SERVER_URL"];
    if (envUrl) {
      return envUrl;
    }

    // Priority 2: concurrent probe of candidate ports (4096-4110)
    // Use Promise.any so we return as soon as the first healthy port responds,
    // eliminating serial timeout delays when the server is on a high port.
    const candidatePorts = Array.from({ length: 15 }, (_, i) => 4096 + i);
    const found = await Promise.any(
      candidatePorts.map(async (port) => {
        const url = `http://127.0.0.1:${port}`;
        const res = await fetch(`${url}/global/health`, {
          signal: AbortSignal.timeout(2000),
        });
        // Only check HTTP 200 — do NOT inspect body.healthy which is unreliable
        if (!res.ok) throw new Error(`port ${port} not ok`);
        return url;
      }),
    ).catch(() => null);

    if (found) return found;

    // Fallback
    return "http://127.0.0.1:4096";
  }
}




/**
 * Try to extract a JSON object from a text string.
 * Handles: bare JSON, ```json ... ``` code fences, and JSON embedded in prose.
 * Returns the parsed object/array, or null if no valid JSON found.
 */
function extractJsonFromText(text: string): unknown {
  if (!text || text.trim().length === 0) return null;

  // Try direct parse first
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }
  } catch {
    // ignore
  }

  // Try ```json ... ``` code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // ignore
    }
  }

  // Try to find first { ... } block
  const braceStart = text.indexOf("{");
  if (braceStart !== -1) {
    const braceEnd = text.lastIndexOf("}");
    if (braceEnd > braceStart) {
      try {
        return JSON.parse(text.slice(braceStart, braceEnd + 1));
      } catch {
        // ignore
      }
    }
  }

  return null;
}


