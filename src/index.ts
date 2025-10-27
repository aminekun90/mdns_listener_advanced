/**
 * mdns-listener-advanced
 * Main entry point – re-exports the Core class and related types.
 */

import { Core } from "./Core.js";

// Default export for CommonJS interop
export default Core;

// Re-export shared types
export * from "./types.js";
