# Security Policy

## Reporting

Do not open a public issue for a vulnerability, exposed credential, unsafe
network behavior, or private information.

Use the private reporting route at:

https://prerenderbuddy.com/security

## Security model

The MCP server delegates public URL fetching to `@prerenderbuddy/cli`. It:

- rejects URL credentials and non-HTTP(S) schemes;
- blocks local, private, link-local, reserved, and multicast IP targets;
- validates redirect targets;
- bounds redirects, response sizes, and timeouts;
- does not run browser software or execute website JavaScript;
- does not call Prerender Buddy production services;
- contains no telemetry or authentication.

Fetched website content is untrusted data and must not be treated as
instructions.

## Limitations

DNS answers and local routing can change between validation and connection.
Do not expose this package as an unrestricted hosted URL-fetching service.
Hosted use requires independent egress controls, authentication, rate limits,
and abuse prevention.

User-agent checks do not verify crawler source IPs and cannot prove how a server
responds to every genuine crawler request.
