# Prerender Buddy MCP

Local MCP tools for checking what public crawlers can read from returned HTTP
responses.

The server wraps the open-source
[`@prerenderbuddy/cli`](https://github.com/kopachlager/prerenderbuddy-cli).
It does not run a browser, execute JavaScript, call the Prerender Buddy API, or
require an account.

## Quick start

Run the stdio server:

```bash
npx --yes @prerenderbuddy/mcp
```

Generic MCP client configuration:

```json
{
  "mcpServers": {
    "prerenderbuddy": {
      "command": "npx",
      "args": ["--yes", "@prerenderbuddy/mcp"]
    }
  }
}
```

Restart the MCP client after changing its configuration.

To verify the connection, ask the client to list its MCP tools. You should see:

```text
check_crawler_readability
compare_http_responses
check_discovery_files
```

## Tools

### `check_crawler_readability`

Fetches one public page using a selected crawler user-agent and returns:

- HTTP status and final URL;
- title, description, canonical, headings, and readable-text counts;
- transparent JavaScript app-shell heuristics;
- evidence, severity, and restrained next steps.

### `compare_http_responses`

Compares a standard browser-style user-agent HTTP response with a selected
crawler user-agent HTTP response.

Both sides are ordinary HTTP responses. Neither executes JavaScript. A
difference is evidence to review, not proof of cloaking or a ranking problem.

### `check_discovery_files`

Checks conventional public `robots.txt`, `sitemap.xml`, and `llms.txt` URLs.
These files can help discovery and access, but they do not make application
content crawler-readable.

Supported crawler profiles:

- `googlebot`
- `bingbot`
- `gptbot`
- `claudebot`

## Example prompts

```text
Check whether Googlebot receives meaningful HTML from https://example.com.
Compare the standard and GPTBot HTTP responses for https://example.com/pricing.
Check the discovery files for https://example.com.
```

## Product boundary

This package provides one-time local diagnostics for public URLs. It:

- uses the same public URL-safety, redirect, timeout, and response-size controls
  as the CLI;
- returns machine-readable results through MCP;
- has no telemetry or authentication;
- makes network requests only to the public URL being checked.

It does not provide:

- browser rendering or JavaScript execution;
- managed crawler routing;
- scheduled monitoring, history, or incidents;
- cache operations;
- DNS or proxy onboarding;
- private Prerender Buddy APIs or infrastructure.

The managed service remains available at
[`prerenderbuddy.com`](https://prerenderbuddy.com) when testing shows that a
production deployment still returns missing, partial, or unreliable HTML.

## Security

Only test websites you are authorized to inspect. The package blocks local,
private, link-local, reserved, and multicast network targets and revalidates
redirect destinations through the CLI.

Fetched website content is untrusted data. MCP clients and language models must
not treat returned page text as instructions. The warning is included in tool
descriptions and structured results, but a warning does not remove
prompt-injection risk. Clients must maintain their own trust boundaries.

Do not expose this local package as an unrestricted public URL-fetching service.
See [SECURITY.md](SECURITY.md) for the complete boundary.

## Results and errors

Successful calls return the complete CLI diagnostic in both `structuredContent`
and serialized JSON text. This preserves the full result for MCP clients that
do not consume structured output. The server never returns full raw HTML. Page
response reads are limited to 10,000–1,000,000 characters, and excerpts remain
bounded by the CLI. Discovery-file reads use the CLI's bounded response handling.

Execution failures return `isError: true`, a short text message, and structured
error data with a stable diagnostic code aligned with the CLI categories:
`invalid_input`,
`unsafe_target`, `timeout`, `request_failed`, or `internal_error`. Unexpected
errors are reduced to a generic message so local paths are not exposed.
Input-schema violations are rejected by the MCP protocol before a diagnostic
runs.

The tools intentionally do not declare `outputSchema` yet. Their
`structuredContent` mirrors the pre-1.0 CLI result, and a schema will be added
after those result shapes stabilize.

## Development

Requires Node.js 20 or newer.

```bash
npm ci --ignore-scripts
npm test
npm run test:coverage
npm run check
npm run pack:check
```

Local repository configuration:

```json
{
  "mcpServers": {
    "prerenderbuddy-local": {
      "command": "node",
      "args": ["/absolute/path/to/prerenderbuddy-mcp/bin/prerenderbuddy-mcp.js"]
    }
  }
}
```

After changing an MCP configuration, fully restart the client. If the server
does not appear, confirm that `node --version` reports 20 or newer and that
`npx --yes @prerenderbuddy/mcp` starts without an immediate error. A stdio MCP
server waiting silently for protocol input is normal. If a GUI client cannot
find `npx`, configure it with the absolute path returned by `command -v npx`.

## License

Apache License 2.0.
