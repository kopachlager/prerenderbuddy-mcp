import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { WORKSPACE_API_OPERATIONS } from '../src/workspace-operations.js';

// Run after changing the API contract. No production request is required.
export async function compileWorkspaceSchemas(spec, operations) {
  const expand = (value, seen = []) => {
    if (!value || typeof value !== 'object') return value;
    if (value.$ref) {
      if (!value.$ref.startsWith('#/') || seen.includes(value.$ref)) throw new Error('Unsupported API schema reference');
      const target = value.$ref.slice(2).split('/').reduce((current, key) => current?.[key], spec);
      if (!target) throw new Error('Missing API schema reference');
      return expand({ ...target, ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')) }, [...seen, value.$ref]);
    }
    if (Array.isArray(value)) return value.map(item => expand(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, seen)]));
  };
  const tools = {};
  for (const [name, [method, path]] of Object.entries(operations)) {
    const operation = spec.paths[path]?.[method];
    const response = Object.entries(operation?.responses || {}).find(([status]) => Number(status) >= 200 && Number(status) < 300)?.[1];
    const schema = expand(response?.content?.['application/json']?.schema);
    if (!schema || schema.type !== 'object') throw new Error(`Missing object response for ${name}`);
    tools[name] = { ...schema, properties: { ...schema.properties, mcpSafetyNote: { type: 'string' } },
      required: [...new Set([...(schema.required || []), 'mcpSafetyNote'])] };
  }
  return { source: 'Prerender Buddy Developer API', contractVersion: spec.info.version, tools };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const input = process.argv[2];
  if (!input) throw new Error('Supply an OpenAPI JSON file.');
  const result = await compileWorkspaceSchemas(JSON.parse(await readFile(input, 'utf8')), WORKSPACE_API_OPERATIONS);
  await writeFile(new URL('../src/workspace-output-schemas.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(`Generated ${Object.keys(result.tools).length} tool contracts from API ${result.contractVersion}.`);
}
