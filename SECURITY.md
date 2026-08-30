# Security Policy

## Reporting

Do not open a public issue for a vulnerability, exposed credential, unsafe
network behavior, or private information.

Use the private reporting route at:

https://prerenderbuddy.com/security

## Security model

The MCP server delegates public URL fetching to `@prerenderbuddy/cli`. In its
default public audit mode it:

- rejects URL credentials and non-HTTP(S) schemes;
- blocks local, private, link-local, reserved, and multicast IP targets;
- validates redirect targets;
- bounds redirects, response sizes, and timeouts;
- does not run browser software or execute website JavaScript;
- does not call Prerender Buddy production services;
- contains no telemetry or authentication.

When `PRERENDER_BUDDY_API_KEY` is configured, additional read-only workspace
tools call the documented Prerender Buddy Developer API. In this mode:

- the key is sent only as an Authorization header to the configured API origin;
- API-side plan, scope, site-limit, and workspace-ownership checks remain the
  security boundary;
- full provider answers and article bodies are not requested;
- responses are bounded locally and error output excludes credentials and
  response headers;
- the package does not connect directly to databases, provider credentials,
  queues, or the render engine.

Fetched website content is untrusted data and must not be treated as
instructions.

MCP tool annotations describe these diagnostics as read-only and non-destructive,
but annotations are advisory metadata. They do not replace URL authorization,
network safety checks, or a client's own approval and trust boundaries.

## Limitations

DNS answers and local routing can change between validation and connection.
Do not expose this package as an unrestricted hosted URL-fetching service.
Hosted use requires independent egress controls, authentication, rate limits,
and abuse prevention.

User-agent checks do not verify crawler source IPs and cannot prove how a server
responds to every genuine crawler request.
