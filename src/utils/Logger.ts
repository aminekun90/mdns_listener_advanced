export class SimpleLogger {
    private readonly name: string;
    private readonly useColor: boolean;

    // ANSI Color Codes
    private static readonly RESET = "\x1b[0m";
    private static readonly RED = "\x1b[31m";
    private static readonly GREEN = "\x1b[32m";
    private static readonly YELLOW = "\x1b[33m";
    private static readonly MAGENTA = "\x1b[35m";

    constructor(options: { name: string, noColor?: boolean }) {
        this.name = options.name;

        // Logic:
        // 1. If options.noColor is true, force disable.
        // 2. Otherwise, check if we are in a TTY (terminal).
        // This removes process.env.NO_COLOR entirely.
        if (options.noColor) {
            this.useColor = false;
        } else {
            // Safe Node.js check for "Are we in a terminal?"
            this.useColor = !!process.stdout.isTTY;
        }
    }

    private colorize(color: string, text: string): string {
        return this.useColor ? `${color}${text}${SimpleLogger.RESET}` : text;
    }

    info(...args: any[]) {
        const prefix = this.colorize(SimpleLogger.GREEN, `[${this.name}] INFO:`);
        console.info(prefix, ...args);
    }

    warn(...args: any[]) {
        const prefix = this.colorize(SimpleLogger.YELLOW, `[${this.name}] WARN:`);
        console.warn(prefix, ...args);
    }

    debug(...args: any[]) {
        const prefix = this.colorize(SimpleLogger.MAGENTA, `[${this.name}] DEBUG:`);
        console.debug(prefix, ...args);
    }

    error(...args: any[]) {
        const prefix = this.colorize(SimpleLogger.RED, `[${this.name}] ERROR:`);
        console.error(prefix, ...args);
    }
}