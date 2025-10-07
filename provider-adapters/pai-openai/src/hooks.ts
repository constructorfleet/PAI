import { spawn } from "node:child_process";
import { HookEnv } from "./types";
import { log } from "./log";

export async function runHook(command: string, env: HookEnv) {
  log("debug", `Running hook: ${command}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env: { ...process.env, ...env }
    });
    child.on("exit", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Hook failed (${command}) with exit code ${code}`));
      }
    });
    child.on("error", reject);
  });
}
