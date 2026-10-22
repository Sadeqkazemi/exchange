## Summary


## Security checklist (docs/security/SECURITY-STANDARD.md)
- [ ] New inputs have DTOs and server-side validation (SEC-API-02, SEC-FE-04)
- [ ] New endpoints require auth and check ownership (SEC-AUTHZ-01/02)
- [ ] Money changes go only through `payment-core` with `Idempotency-Key` (SEC-PAY-01/04)
- [ ] No floats for amounts (SEC-PAY-09)
- [ ] No secrets or sensitive data in code or logs (SEC-KEY-01, SEC-AUD-03)
- [ ] Admin/financial actions write an audit entry; four-eyes where required (SEC-AUD-01, SEC-ADM-04)
- [ ] Tests cover the relevant requirement IDs (SEC-SDLC-06)
- [ ] New dependencies are justified (SEC-SDLC-03)
- [ ] Touches money, identity or C1/C2 data → short STRIDE threat model below (SEC-SDLC-05)

Requirement IDs addressed:

Exceptions (link to docs/security/exceptions.md), if any:
