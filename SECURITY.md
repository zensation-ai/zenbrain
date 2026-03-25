# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

**Please do NOT create public GitHub issues for security vulnerabilities.**

Report security vulnerabilities to **security@zensation.ai**.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action | Timeframe |
|--------|-----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix timeline provided | Within 10 business days |
| Patch release | As soon as fix is verified |

## Security Design

ZenBrain follows these security principles:

- **Parameterized queries** — all SQL uses `$1, $2` placeholders, never string concatenation
- **No eval()** — no dynamic code execution
- **No network calls** — algorithms package has zero runtime dependencies
- **Input validation** — all public APIs validate inputs
- **Dependency minimization** — core algorithms have zero dependencies

## Responsible Disclosure

We ask that you:
1. Give us reasonable time to fix the issue before public disclosure
2. Make a good faith effort to avoid privacy violations and data destruction
3. Not exploit the vulnerability beyond what's necessary to demonstrate it

We will:
1. Acknowledge your report promptly
2. Keep you informed of our progress
3. Credit you in the security advisory (unless you prefer otherwise)
