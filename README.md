# نیکسوپی (Nixopay)

Persian (RTL) foreign-currency payment service: public site, user panel and admin panel.
Built with **Next.js 16 (App Router) + React 19 + TypeScript**, from the design handoff in
[`docs/design-handoff`](docs/design-handoff/README.md).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Routes

| Route | Screen |
|---|---|
| `/` | Landing |
| `/about`, `/contact`, `/terms` | Static pages |
| `/service-*`, `/payment-*` | Service marketing pages |
| `/subscription-plans` | Subscription checkout |
| `/auth` | Mobile + OTP login |
| `/panel` | User panel (dashboard, orders, wallet, tickets, profile, cancel/refund request) |
| `/admin/login` | Admin login |
| `/admin` | Admin panel (dashboard, desk, orders, users, finance, services, staff & permissions) |

## How the screens are built

Each prototype `docs/design-handoff/<name>.dc.html` is compiled by `scripts/convert-dc.mjs`
(`npm run convert`) into `src/screens/<name>/`:

- `logic.js` – the prototype's logic class (`state`, handlers, `renderVals()`): data shapes,
  state transitions and validation rules.
- `view.tsx` – the template compiled to JSX (`sc-if` → conditionals, `sc-for` → `map`,
  `{{ path }}` → bindings, `style-hover`/`style-focus` → CSS classes in `styles.css`).
- `index.tsx` – binds logic + view via `src/dc/runtime.tsx`.

The App Router pages in `src/app/(screens)` are also generated. Screens render client-side only:
their logic reads `window`/`location` and simulates a drifting exchange rate.
Design tokens live in `src/app/globals.css`.

Don't edit generated files by hand. Update the handoff, then re-run `npm run convert`.

## Not done yet (backend)

All data is still sample data from the prototype. The user panel and admin panel aren't connected.
See "State / Backend Requirements" in the handoff README. Still needed: orders, refunds (CR/RF),
formal invoices, users/KYC, wallet ledger, services, staff/roles, a real exchange-rate source,
OTP auth and audit logging.
