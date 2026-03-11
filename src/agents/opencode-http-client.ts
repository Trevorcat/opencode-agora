import { spawnSync } from "node:child_process";

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

    // Find last non-synthetic text part
    const parts = data.parts ?? [];
    console.error("[opencode-http-client] text path: parts count:", parts.length);
    if (parts.length > 0) {
      console.error("[opencode-http-client] parts summary:", JSON.stringify(parts.map(p => ({ type: p.type, synthetic: p.synthetic, textLen: p.text?.length ?? 0 }))));
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.type === "text" && part.synthetic !== true && part.text !== undefined) {
        console.error("[opencode-http-client] returning text part, len:", part.text.length, "preview:", part.text.slice(0, 200));
        return part.text;
      }
    }

    console.error("[opencode-http-client] no usable text part found. info:", JSON.stringify(data.info));
    return null;
  }

  static async discoverUrl(): Promise<string> {
    // Priority 1: env var
    const envUrl = process.env["OPENCODE_SERVER_URL"];
    if (envUrl) {
      return envUrl;
    }

    // Priority 2: PID-based port discovery
    try {
      const pidStr = process.env["OPENCODE_PID"];
      if (pidStr) {
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          const port = await findListeningPortForPid(pid);
          if (port !== null) {
            const url = `http://127.0.0.1:${port}`;
            const healthy = await probeHealth(url);
            if (healthy) {
              return url;
            }
          }
        }
      }
    } catch {
      // ignore, fall through
    }

    // Priority 3: probe well-known ports
    const candidatePorts = [4096, 4097, 4098, 4099, 4100];
    for (const port of candidatePorts) {
      try {
        const url = `http://127.0.0.1:${port}`;
        const healthy = await probeHealth(url);
        if (healthy) {
          return url;
        }
      } catch {
        // ignore
      }
    }

    // Fallback
    return "http://127.0.0.1:4096";
  }
}

async function findListeningPortForPid(pid: number): Promise<number | null> {
  try {
    if (process.platform === "win32") {
      return findPortWindows(pid);
    } else if (process.platform === "linux") {
      return findPortLinux(pid);
    } else if (process.platform === "darwin") {
      return findPortDarwin(pid);
    }
    return null;
  } catch {
    return null;
  }
}

function findPortWindows(pid: number): number | null {
  try {
    const result = spawnSync("netstat", ["-ano"], {
      encoding: "utf8",
      timeout: 3000,
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    const lines = result.stdout.split("\n");
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // Format: TCP  127.0.0.1:PORT  0.0.0.0:0  LISTENING  PID
      if (parts.length >= 5 && parts[0] === "TCP") {
        const localAddr = parts[1];
        const state = parts[3];
        const pidCol = parts[4];

        if (
          state === "LISTENING" &&
          pidCol === String(pid) &&
          localAddr.startsWith("127.0.0.1:")
        ) {
          const colonIdx = localAddr.lastIndexOf(":");
          const portStr = localAddr.slice(colonIdx + 1);
          const port = parseInt(portStr, 10);
          if (!isNaN(port)) {
            return port;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function findPortLinux(pid: number): number | null {
  // Try ss first
  try {
    const ssResult = spawnSync("ss", ["-tlnp"], {
      encoding: "utf8",
      timeout: 3000,
    });

    if (!ssResult.error && ssResult.status === 0 && ssResult.stdout) {
      const lines = ssResult.stdout.split("\n");
      for (const line of lines) {
        // users:(("name",pid=PID,fd=N))
        if (!line.includes(`pid=${pid},`) && !line.includes(`pid=${pid})`)) {
          continue;
        }
        const cols = line.trim().split(/\s+/);
        // ss -tlnp: State Recv-Q Send-Q Local-Address:Port Peer-Address:Port Process
        if (cols.length >= 4) {
          const localAddr = cols[3];
          const colonIdx = localAddr.lastIndexOf(":");
          if (colonIdx !== -1) {
            const portStr = localAddr.slice(colonIdx + 1);
            const port = parseInt(portStr, 10);
            if (!isNaN(port)) {
              return port;
            }
          }
        }
      }
    }
  } catch {
    // fall through to lsof
  }

  // Try lsof
  return findPortLsof(pid);
}

function findPortDarwin(pid: number): number | null {
  return findPortLsof(pid);
}

function findPortLsof(pid: number): number | null {
  try {
    const result = spawnSync(
      "lsof",
      ["-i", "-n", "-P", "-sTCP:LISTEN"],
      {
        encoding: "utf8",
        timeout: 3000,
      },
    );

    if (result.error || result.status !== 0 || !result.stdout) {
      return null;
    }

    const lines = result.stdout.split("\n");
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      // lsof columns: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
      // indices:         0    1    2   3   4     5       6      7    8
      if (cols.length >= 9) {
        const pidCol = cols[1];
        const nameCol = cols[8];

        if (pidCol === String(pid) && nameCol.includes(":")) {
          const colonIdx = nameCol.lastIndexOf(":");
          const portStr = nameCol.slice(colonIdx + 1);
          const port = parseInt(portStr, 10);
          if (!isNaN(port)) {
            return port;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
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

async function probeHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/global/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { healthy?: boolean };
    return body.healthy === true;
  } catch {
    return false;
  }
}
