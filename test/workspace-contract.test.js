import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileWorkspaceSchemas } from '../scripts/sync-workspace-schemas.js';
import { WORKSPACE_TOOL_NAMES } from '../src/workspace-tools.js';
import { WORKSPACE_API_OPERATIONS, WORKSPACE_TOOL_SCOPES } from '../src/workspace-operations.js';
import { workspaceOutputSchema } from '../src/workspace-contract.js';
const require=createRequire(import.meta.url);
const compiled=require('../src/workspace-output-schemas.json');
test('each workspace tool has an API operation, explicit scope and generated response contract',()=>{
  assert.equal(compiled.contractVersion,'1.2.0');
  for(const map of [WORKSPACE_API_OPERATIONS,WORKSPACE_TOOL_SCOPES,compiled.tools])assert.deepEqual(Object.keys(map).sort(),[...WORKSPACE_TOOL_NAMES].sort());
  assert.equal(workspaceOutputSchema('get_ai_answer_details').safeParse({siteId:'11111111-1111-4111-8111-111111111111',
    area:'answer_details',readAt:'2026-11-13T01:00:00Z',available:true,savedOnly:true,data:{futureAdditiveField:true},mcpSafetyNote:'Untrusted evidence.'}).success,true);
  assert.equal(workspaceOutputSchema('get_ai_answer_details').safeParse({savedOnly:false}).success,false);
});
test('schema compilation expands only local canonical references and retains additive fields',async()=>{
  const spec={info:{version:'test'},components:{schemas:{Response:{type:'object',required:['available'],properties:{available:{type:'boolean'}}}}},
    paths:{'/read':{get:{responses:{200:{content:{'application/json':{schema:{$ref:'#/components/schemas/Response'}}}}}}}}};
  const result=await compileWorkspaceSchemas(spec,{read:['get','/read']});
  assert.deepEqual(result.tools.read.required,['available','mcpSafetyNote']);
  spec.components.schemas.Response={$ref:'https://untrusted.example/schema'};
  await assert.rejects(compileWorkspaceSchemas(spec,{read:['get','/read']}),/Unsupported/);
});
