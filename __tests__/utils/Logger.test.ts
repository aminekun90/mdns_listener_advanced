import { SimpleLogger } from "@/utils/Logger.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("SimpleLogger", () => {
  let consoleSpy: {
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    debug: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    // Spy on console methods to verify output without printing to stdout
    consoleSpy = {
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Color Logic", () => {
    it("should disable colors when noColor option is true", () => {
      // Force TTY to true to ensure our option overrides it
      process.stdout.isTTY = true;

      const logger = new SimpleLogger({ name: "TEST", noColor: true });
      logger.info("message");

      // Expect Plain Text: "[TEST] INFO:"
      expect(consoleSpy.info).toHaveBeenCalledWith("[TEST] INFO:", "message");
    });

    it("should enable colors when TTY is true and noColor is false", () => {
      process.stdout.isTTY = true;

      const logger = new SimpleLogger({ name: "TEST", noColor: false });
      logger.info("message");

      // Expect ANSI Codes: "\x1b[32m[TEST] INFO:\x1b[0m"
      const callArgs = consoleSpy.info.mock.calls[0];
      expect(callArgs[0]).toContain("\x1b[32m"); // Green color code
      expect(callArgs[0]).toContain("[TEST] INFO:");
      expect(callArgs[0]).toContain("\x1b[0m"); // Reset code
    });

    it("should disable colors automatically if not in TTY", () => {
      // Simulate non-interactive terminal (e.g. CI pipe)
      process.stdout.isTTY = undefined as unknown as boolean;

      const logger = new SimpleLogger({ name: "TEST" });
      logger.info("message");

      // Expect Plain Text
      expect(consoleSpy.info).toHaveBeenCalledWith("[TEST] INFO:", "message");
    });
  });

  describe("Log Levels", () => {
    // We use noColor: true here to simplify string matching assertions
    const logger = new SimpleLogger({ name: "TEST", noColor: true });

    it("should log info messages to console.info", () => {
      logger.info("hello world", { foo: "bar" });
      expect(consoleSpy.info).toHaveBeenCalledWith("[TEST] INFO:", "hello world", { foo: "bar" });
    });

    it("should log warning messages to console.warn", () => {
      logger.warn("warning happened");
      expect(consoleSpy.warn).toHaveBeenCalledWith("[TEST] WARN:", "warning happened");
    });

    it("should log debug messages to console.debug", () => {
      logger.debug("debugging");
      expect(consoleSpy.debug).toHaveBeenCalledWith("[TEST] DEBUG:", "debugging");
    });

    it("should log error messages to console.error", () => {
      const err = new Error("oops");
      logger.error("fatal error", err);
      expect(consoleSpy.error).toHaveBeenCalledWith("[TEST] ERROR:", "fatal error", err);
    });
  });
});
