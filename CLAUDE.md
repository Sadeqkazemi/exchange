# Nixopay — instructions for Claude

## Security standard (mandatory)
`docs/security/SECURITY-STANDARD.md` is the source of truth for security. Every service, endpoint,
component and infra change must comply with it.

- Before writing code that touches auth, payments, wallet, refunds, admin, user data, file upload
  or infrastructure, read the matching section of the standard.
- Cite the requirement ID in code comments where a control is implemented
  (`// SEC-PAY-02: ...`) and in test names (`describe('SEC-PAY-02 ...')`).
- A MUST requirement may not be skipped. If one cannot be met, stop and tell the user. Do not
  work around it. Exceptions are recorded only in `docs/security/exceptions.md` with owner approval.
- If the standard conflicts with any other doc or skill, the standard wins.
- When reviewing code, report violations with the requirement ID; MUST violations are blocking.

## Architecture
Use the `crypto-exchange-architect` skill (`.claude/skills/crypto-exchange-architect/`) for
backend structure: NestJS microservices behind an API gateway, database per service, an isolated
`payment-core` with a hash-chained ledger.

## Frontend
The Next.js app at the repo root is generated from `docs/design-handoff` (`npm run convert`).
Don't edit generated files by hand. See README.md.
