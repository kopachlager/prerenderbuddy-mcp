import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_VERSION } from '../src/server.js';
import { TOOL_NAMES } from '../src/tools.js';
import { WORKSPACE_TOOL_NAMES } from '../src/workspace-tools.js';
import { WorkspaceApiError } from '../src/workspace-client.js';
import { WORKSPACE_TOOL_SCOPES, WORKSPACE_API_OPERATIONS } from '../src/workspace-operations.js';

async function createTestClient(diagnostics, workspace = { enabled: false }) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({ diagnostics, workspace });
  const client = new Client({
    name: 'prerenderbuddy-mcp-protocol-test',
    version: '1.0.0',
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

test('stdio binary initializes, reports the package version, lists tools, and shuts down', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['bin/prerenderbuddy-mcp.js'],
    stderr: 'pipe',
  });
  const client = new Client({
    name: 'prerenderbuddy-mcp-test',
    version: '1.0.0',
  });

  await client.connect(transport);
  const pid = transport.pid;
  try {
    assert.ok(pid);
    assert.equal(client.getServerVersion()?.version, SERVER_VERSION);
    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name), TOOL_NAMES);
    for (const tool of result.tools) {
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  } finally {
    await client.close();
  }
  assert.equal(transport.pid, null);
});

test('protocol calls all three tools with deterministic diagnostics', async () => {
  const diagnostics = {
    async checkUrl() {
      return { command: 'check', summary: 'pass', response: { statusCode: 200 } };
    },
    async compareUrl() {
      return { command: 'compare', summary: 'warning', differences: [] };
    },
    async checkDiscoveryFiles() {
      return { command: 'files', summary: 'pass', files: [] };
    },
  };
  const { client, close } = await createTestClient(diagnostics);

  try {
    const calls = [
      ['check_crawler_readability', 'check'],
      ['compare_http_responses', 'compare'],
      ['check_discovery_files', 'files'],
    ];
    for (const [name, command] of calls) {
      const result = await client.callTool({
        name,
        arguments: { url: 'https://fixture.example' },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.command, command);
      assert.match(result.structuredContent.mcpSafetyNote, /untrusted data/);
    }
  } finally {
    await close();
  }
});

test('authenticated mode adds workspace tools with explicit write annotations', async () => {
  const calls = [];
  const workspace = {
    client: {
      enabled: true,
      async get(path, query) {
        calls.push({ path, query });
        return { siteId: path.split('/')[4], configured: false, project: null };
      },
    },
  };
  const { client, close } = await createTestClient({}, workspace);
  try {
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [...TOOL_NAMES, ...WORKSPACE_TOOL_NAMES],
    );
    for (const tool of listed.tools.filter((item) => WORKSPACE_TOOL_NAMES.includes(item.name))) {
      const writes = ['prepare_article_proposal', 'generate_article'].includes(tool.name);
      assert.deepEqual(tool.annotations, {
        readOnlyHint: !writes, destructiveHint: false, idempotentHint: true, openWorldHint: writes,
      });
    }
    const siteId = 'fae03b4c-48cd-44f9-a229-60c820630e5c';
    const result = await client.callTool({
      name: 'get_ai_visibility',
      arguments: { siteId, days: 90 },
    });
    assert.equal(result.isError, undefined);
    assert.ok(listed.tools.find(tool => tool.name === 'get_ai_visibility').outputSchema);
    assert.deepEqual(calls, [{
      path: `/v1/developer/sites/${siteId}/visibility`,
      query: { days: 90 },
    }]);
    assert.match(result.structuredContent.mcpSafetyNote, /workspace evidence/i);
  } finally {
    await close();
  }
});

test('protocol rejects invalid input through the MCP schema', async () => {
  const { client, close } = await createTestClient({});
  try {
    const result = await client.callTool({
      name: 'check_crawler_readability',
      arguments: { url: 'https://fixture.example', maxChars: 1 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Input validation error/);
    assert.equal(result.structuredContent, undefined);
  } finally {
    await close();
  }
});

test('saved tools use explicit read scopes, canonical output contracts and no write calls', async () => {
  const siteId='fae03b4c-48cd-44f9-a229-60c820630e5c'; const calls=[];
  const workspace={client:{enabled:true,get:async(path,query)=>{
    calls.push({path,query});
    if(path.endsWith('/usage'))return {plan:{name:'starter'},renders:4};
    return {siteId,area:path.endsWith('/search')?'google_search':path.endsWith('/opportunities')?'search_opportunities':
      path.endsWith('/referrals')?'referrals':path.endsWith('/research')?'research':path.endsWith('/understanding')?'understanding':
        path.endsWith('/answers')?'answer_details':'crawler_visits',
      readAt:new Date().toISOString(),savedOnly:true,available:true,data:{note:'Saved evidence only.'}};
  },post:async()=>{throw Error('Unexpected write');}}};
  const {client,close}=await createTestClient({},workspace);
  try {
    const {tools}=await client.listTools();
    for(const name of WORKSPACE_TOOL_NAMES.slice(11)) {
      const tool=tools.find(item=>item.name===name);assert.equal(tool.annotations.readOnlyHint,true);
      assert.deepEqual(tool._meta.securitySchemes,[{type:'oauth2',scopes:WORKSPACE_TOOL_SCOPES[name]}]);
      assert.ok(tool.outputSchema);
      const result=await client.callTool({name,arguments:name==='get_workspace_usage'?{}:{siteId}});
      assert.notEqual(result.isError,true,name);assert.equal(calls.at(-1).path,WORKSPACE_API_OPERATIONS[name][1].replace('{id}',siteId));
    }
    const count=calls.length;
    const invalid=await client.callTool({name:'get_ai_crawler_visits',arguments:{siteId,timeZone:'invalid/zone'}});
    assert.equal(invalid.isError,true);assert.equal(calls.length,count);
    const search=await client.callTool({name:'get_google_search_performance',arguments:{siteId,days:30}});
    assert.equal(search.isError,true);assert.equal(calls.length,count);
  }finally{await close();}
});

test('missing hosted permissions return explicit OAuth challenge and safe retry guidance',async()=>{
  const siteId='fae03b4c-48cd-44f9-a229-60c820630e5c';
  const workspace={oauthResource:'https://mcp.prerenderbuddy.com/.well-known/oauth-protected-resource',client:{enabled:true,get:async()=>{
    throw new WorkspaceApiError('Authorize the search permission.',{status:403,code:'insufficient_scope',requiredScopes:['search'],retryAfterSeconds:20});
  }}};
  const {client,close}=await createTestClient({},workspace);
  try{
    const result=await client.callTool({name:'get_google_search_performance',arguments:{siteId}});
    assert.equal(result.isError,true);assert.deepEqual(result.structuredContent.error.requiredScopes,['search']);
    assert.equal(result.structuredContent.error.retryAfterSeconds,20);
    assert.match(result._meta['mcp/www_authenticate'][0],/error="insufficient_scope"/);
    assert.match(result._meta['mcp/www_authenticate'][0],/scope="search"/);
  }finally{await close();}
});

test('protocol returns structured execution errors without stack traces', async () => {
  const { client, close } = await createTestClient({
    async checkUrl() {
      throw new Error('The URL resolves to a private or blocked network address.');
    },
  });

  try {
    const result = await client.callTool({
      name: 'check_crawler_readability',
      arguments: { url: 'https://fixture.example' },
    });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.error, {
      code: 'unsafe_target',
      message: 'The URL resolves to a private or blocked network address.',
    });
    assert.doesNotMatch(result.content[0].text, /\n\s+at |file:\/\//);
  } finally {
    await close();
  }
});

 test('article workflow routes only confirmed writes and uses stable task IDs', async () => {
  const calls = [];
  const workspace = { client: { enabled: true,
    get: async (path, query) => { calls.push({ method: 'GET', path, query }); return path.endsWith('/ideas') ? {ideas:[],allowance:{limit:1,used:0,remaining:1}}
      : {taskId,siteId,status:'proposal_ready',allowance:{limit:1,used:0,remaining:1},confirmationRequired:true,draft:null,pollAfterSeconds:null}; },
    post: async (path, body) => { calls.push({ method: 'POST', path, body }); return {taskId,siteId,status:'generation_queued',allowance:{limit:1,used:0,remaining:1},confirmationRequired:false,draft:null,pollAfterSeconds:5}; },
  }};
  const { client, close } = await createTestClient({}, workspace);
  const siteId='fae03b4c-48cd-44f9-a229-60c820630e5c', taskId='94e5d8d7-19fa-49e8-b89a-61c1545b7bf5';
  try {
    const invalid=await client.callTool({name:'generate_article',arguments:{siteId,taskId,confirmGeneration:false}});
    assert.equal(invalid.isError,true);assert.equal(calls.length,0);
    await client.callTool({name:'list_article_ideas',arguments:{siteId}});
    await client.callTool({name:'prepare_article_proposal',arguments:{siteId,promptId:taskId,requestId:taskId,note:'For beginners'}});
    await client.callTool({name:'get_article_task',arguments:{siteId,taskId}});
    await client.callTool({name:'generate_article',arguments:{siteId,taskId,confirmGeneration:true}});
    assert.equal(calls[0].path,`/v1/developer/sites/${siteId}/content/ideas`);
    assert.equal(calls[1].body.requestId,taskId);
    assert.equal(calls[2].method,'GET');
    assert.deepEqual(calls[3],{method:'POST',path:`/v1/developer/sites/${siteId}/content/tasks/${taskId}/generate`,body:{confirmGeneration:true}});
  } finally { await close(); }
});
