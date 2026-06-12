import { spawn } from "node:child_process";
import { z } from "zod";

export type JsonLine = Record<string, unknown>;

export function runPythonJsonLines<T>(options: {
  scriptPath: string;
  args: string[];
  resultSchema: z.ZodType<T>;
  onLine?: (line: JsonLine) => void;
}): Promise<T> {
  const python = process.env.PYTHON_BIN ?? "python3";

  return new Promise<T>((resolve, reject) => {
    const proc = spawn(python, [options.scriptPath, ...options.args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let result: T | null = null;
    let parseError: Error | null = null;

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed: unknown = JSON.parse(line);
          const jsonLine = z.record(z.string(), z.unknown()).parse(parsed);
          options.onLine?.(jsonLine);
          const maybeResult = options.resultSchema.safeParse(jsonLine);
          if (maybeResult.success) result = maybeResult.data;
        } catch (err) {
          parseError = err instanceof Error ? err : new Error("invalid python json line");
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (parseError) {
        reject(parseError);
        return;
      }
      if (code !== 0) {
        reject(new Error(`python worker failed (${code}): ${stderr || stdout}`));
        return;
      }
      if (!result) {
        reject(new Error("python worker completed without valid result"));
        return;
      }
      resolve(result);
    });

    proc.on("error", reject);
  });
}
