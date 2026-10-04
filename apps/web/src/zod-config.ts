import { z } from 'zod';

// Zod 4 probes for `eval` support (a caught `new Function("")`) the first time it builds an object
// schema. Under a strict CSP the throw is swallowed, but the browser still reports the attempt as a
// securitypolicyviolation, and the CSP has no exceptions (spec FR-022, SC-003). `jitless` skips the
// probe. Schemas are built when modules are imported, so this module must be the first import of the
// app's entry point.
z.config({ jitless: true });
