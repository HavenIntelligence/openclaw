# ClawDock — Agent Runtime Runners

Each agent has a `runtime` field (stored in `AgentMeta`) that selects which CLI tool is used to execute tasks. All runners implement the `CliAgentRunner` interface from `src/company/runners/base.ts`.

---

## `CliAgentRunner` Interface

```typescript
interface CliAgentRunner {
  readonly name: ClawDockRuntime;
  isAvailable(): Promise<boolean>;
  runTask(agentId: string, prompt: string, opts?: RunOpts): ChildProcess;
  parseOutput(line: string): ParsedOutput | null;
}
```

All runners spawn child processes with `stdio: ['ignore', 'pipe', 'pipe']`. `ProcessManager` reads stdout/stderr line-by-line and calls `parseOutput` on each line.

### `RunOpts`

```typescript
interface RunOpts {
  cwd?: string; // working directory for the process
  env?: NodeJS.ProcessEnv; // extra env vars
  maxTurns?: number; // max tool call turns
  allowedTools?: string[]; // tool allowlist (runner-specific)
  openclawAgentId?: string; // openclaw runner: --agent <id>
  systemPrompt?: string; // role/persona prefix injected before prompt
}
```

### `ParsedOutput`

```typescript
type ParsedOutput =
  | { type: "log"; entry: Partial<LogEntry> } // intermediate output
  | { type: "result"; content: string; tokensUsed?: number } // final answer
  | { type: "error"; message: string }; // runner error
```

---

## `openclaw` Runner

**File:** `src/company/runners/openclaw-runner.ts`
**Binary:** `openclaw`
**Availability check:** `which openclaw`

### Command

```bash
openclaw agent --local --json --agent <agentId> -m "<prompt>"
```

- `--local` — runs against the local Pi session (bypasses gateway routing)
- `--json` — outputs a single multi-line pretty-printed JSON object to stdout
- `--agent <id>` — which agent session to use (from `meta.agentCli`, defaults to `"main"`)

If `systemPrompt` is set, the prompt is prefixed: `[Role: <systemPrompt>]\n\n<prompt>`.

### Output Format

```json
{
  "payloads": [{ "text": "The agent's response..." }],
  "meta": {
    "durationMs": 4200,
    "agentMeta": { "usage": { "output": 312 } }
  }
}
```

This is emitted as **multi-line** pretty-printed JSON. The runner uses a **stateful line accumulator** (`createOpenClawLineParser()`) rather than the standard per-line `parseOutput` method, because:

- Multi-line JSON cannot be parsed line-by-line
- The accumulator buffers lines and tries `JSON.parse` on each new line; emits once it succeeds

**`createOpenClawLineParser()` returns a closure that:**

1. Buffers each line
2. Suppresses `[tools]` and `[warn]` prefixed lines (emits as `system` log)
3. Attempts `JSON.parse(buf.join('\n'))` on every call
4. On first successful parse: extracts `payloads[].text`, emits `{ type: "result", content, tokensUsed }` and stops processing

**Stream-JSON compat:** Also handles `{ type: "assistant", content: string }` and `{ type: "result", ... }` for compatibility with `--output-format stream-json` mode.

---

## `claude-code` Runner

**File:** `src/company/runners/claude-code-runner.ts`
**Binary:** `claude` (Claude Code CLI)
**Availability check:** `which claude`

### Command

```bash
claude -p "<prompt>" \
  --output-format stream-json \
  --verbose \
  --max-turns <maxTurns=20> \
  --allowedTools Read,Write,Edit,Bash,Glob,Grep
```

- `--output-format stream-json` — NDJSON stream (one JSON object per line)
- The `CLAUDECODE` environment variable is deleted before spawning to allow claude to run inside an existing Claude Code session

### Output Format (NDJSON)

Each stdout line is a JSON object:

| `type`        | Description                                   | Mapped to                                               |
| ------------- | --------------------------------------------- | ------------------------------------------------------- |
| `"assistant"` | Agent message content (text or content array) | `LogEntry { type: "output" }`                           |
| `"tool_use"`  | Tool invocation                               | `LogEntry { type: "tool_call", content: "name(args)" }` |
| `"result"`    | Final result                                  | `ParsedOutput { type: "result", content, tokensUsed }`  |

Non-JSON lines are emitted as raw `output` log entries.

**Content extraction for `"assistant"` type:**

- If `message.content` is a string: use directly
- If `message.content` is an array: collect all `{ type: "text", text: string }` blocks

---

## `gemini` Runner

**File:** `src/company/runners/gemini-runner.ts`
**Binary:** `gemini` (Google Gemini CLI)
**Availability check:** `which gemini`

### Command

```bash
gemini -p "<prompt>"
```

### Output Format

Plain text or JSON blob on stdout. The parser:

1. Tries `JSON.parse(line)` — if the object has a `text` or `result` field, emits as `{ type: "result" }`
2. Otherwise emits each non-empty line as a `{ type: "output" }` log entry

**Note:** Gemini CLI output accumulation (the full response may come as many lines of plain text before a final JSON summary) means the frontend will see many individual `output` log entries rather than a single final result. This is acceptable for MVP.

---

## `codex` Runner

**File:** `src/company/runners/codex-runner.ts`
**Binary:** `codex` (OpenAI Codex CLI)
**Availability check:** `which codex`

### Command

```bash
codex "<prompt>" --full-auto
```

### Output Format (JSONL)

Each stdout line is a JSON object:

| `type`                            | Description                        | Mapped to                         |
| --------------------------------- | ---------------------------------- | --------------------------------- |
| `"output"` with `content: string` | Agent output                       | `LogEntry { type: "output" }`     |
| `"tool_call"`                     | Tool invocation                    | `LogEntry { type: "tool_call" }`  |
| `"done"` or `"result"`            | Final result (uses `output` field) | `ParsedOutput { type: "result" }` |

Non-JSON lines are emitted as raw output.

---

## `aider` Runner

**File:** `src/company/runners/aider-runner.ts`
**Binary:** `aider`
**Availability check:** `which aider`

### Command

```bash
aider --message "<prompt>" --yes --no-stream
```

- `--yes` — auto-confirm all prompts (non-interactive)
- `--no-stream` — wait for complete output before printing

### Output Format

Plain text only. Every non-empty stdout line is emitted as a `{ type: "output" }` log entry. There is no structured "result" marker; the task is considered complete when the process exits with code 0.

---

## Adding a New Runner

1. Create `src/company/runners/<name>-runner.ts` implementing `CliAgentRunner`
2. Add the runtime name to `ClawDockRuntime` in `src/company/types.ts`
3. Register the runner in `CompanyService` constructor (`src/company/company-service.ts`):
   ```typescript
   const runners = [
     new OpenClawRunner(),
     new ClaudeCodeRunner(),
     new GeminiRunner(),
     new CodexRunner(),
     new AiderRunner(),
     new MyNewRunner(), // ← add here
   ];
   ```
4. Mirror the type in `ui/src/ui/company-types.ts`:
   ```typescript
   export type ClawDockRuntime =
     | "openclaw"
     | "claude-code"
     | "gemini"
     | "codex"
     | "aider"
     | "my-new-runner";
   ```

---

## Runner Availability

`isAvailable()` is not currently called at startup (all runners are always registered). It is intended for future use in the UI to show which runtimes are actually installed. You can test availability manually:

```typescript
const available = await new ClaudeCodeRunner().isAvailable();
// → true if `claude` binary is on PATH
```
