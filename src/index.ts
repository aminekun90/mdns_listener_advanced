/**
 * mdns-listener-advanced
 * Main entry point – re-exports the Core class and related types.
 */

// 1. Import the class from the source
import { Core } from "./Core.js";

// 2. Re-export shared types
export * from "./types.js";

// 3. Export as Named Export
export { Core };

// 4. Export as Default Export
export default Core;
