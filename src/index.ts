/**
 * mdns-listener-advanced
 * Main entry point – re-exports the Core class and related types.
 */

// 1. Import the class from the source
// This allows import Core from 'mdns-listener-advanced'

import { Core } from "./Core.js";

// 2. Re-export shared types
export * from "./types.js";

// 3. Export as Named Export
export { Core }; // NOSONAR annoying sonarcloud issue with export default

// 4. Export as Default Export
// This allows both import Core from 'mdns-listener-advanced' and import { Core } from 'mdns-listener-advanced'
export default Core; // NOSONAR annoying sonarcloud issue with export default
