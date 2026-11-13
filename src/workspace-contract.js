import { createRequire } from 'node:module';
import { z } from 'zod';

import { WORKSPACE_API_OPERATIONS } from './workspace-operations.js';
export { WORKSPACE_API_OPERATIONS };

const require = createRequire(import.meta.url);
const schemas = require('./workspace-output-schemas.json');
const converted = new Map();
export function workspaceOutputSchema(name) {
  if (!converted.has(name)) {
    if (!schemas.tools[name]) throw new Error(`Missing workspace output contract: ${name}`);
    converted.set(name, z.fromJSONSchema(schemas.tools[name]));
  }
  return converted.get(name);
}
