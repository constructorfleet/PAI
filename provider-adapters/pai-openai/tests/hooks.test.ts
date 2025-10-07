/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { runHook } from "../src/hooks";

const nodeBinary = process.execPath;

describe("runHook", () => {
  it("runs hook command with injected environment", async () => {
    await expect(
      runHook(
        `${nodeBinary} -e "if (process.env.TEST_VALUE !== 'ok') { process.exit(1); }"`,
        { TEST_VALUE: "ok" }
      )
    ).resolves.toBeUndefined();
  });

  it("rejects when hook exits with non-zero status", async () => {
    await expect(
      runHook(`${nodeBinary} -e "process.exit(3)"`, {})
    ).rejects.toThrow(/exit code 3/);
  });
});
