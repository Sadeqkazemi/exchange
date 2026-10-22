# Handoff: Nixopay (نیکسوپی) — Site, User Panel, Admin Panel

## Overview
Nixopay is a Persian (RTL) foreign-currency payment service. Customers pay in toman and Nixopay pays foreign services on their behalf: subscriptions (ChatGPT, Spotify, Netflix…), gift cards (Steam, Apple, Google Play…), and payments on foreign sites (exam fees, embassy appointments, hotel booking, online shopping). Cryptocurrency is explicitly **not** offered.

The product has three surfaces:
1. **Public site**: landing, service pages, about/contact/terms, auth.
2. **User panel**: dashboard, ordering, orders and tracking, wallet, tickets, profile/KYC, bank accounts.
3. **Admin panel**: operations, finance, users, catalogue, staff and permissions.

## About the Design Files
The `.dc.html` files in this bundle are **design references built in HTML**. They are interactive prototypes showing the intended look and behaviour, not production code to copy. Recreate them in the target codebase's environment (React/Next.js, Vue, etc.) using its own patterns and libraries. If no codebase exists yet, a good fit is **Next.js + TypeScript + Tailwind (RTL)**, a component library with RTL support, and a typed API layer.

To open a file, serve the folder over a local static server (for example `npx serve .`) and open any `.dc.html` file. `support.js` is the prototype runtime. Each file holds an inline-styled template between `<x-dc>` tags plus a `class Component extends DCLogic` block with `state` and `renderVals()`. The logic class is the best place to read data shapes, state transitions and validation rules.

**All data is sample data** (hard-coded arrays inside each file's logic class). The exchange rate is simulated with about ±1% drift per minute. Nothing is persisted, and the user panel and admin panel are not connected in the prototype; the backend must connect them.

## Fidelity
**High-fidelity.** Colours, typography, spacing, radii and interaction states are final. Recreate them pixel-accurately, but map them to shared tokens and components rather than copying inline styles.

## Global Conventions
- `dir="rtl"`, `lang="fa"`. Font: **Vazirmatn** (Google Fonts), weights 400–900.
- Numbers are displayed in Persian digits (`toLocaleString('fa-IR')`). Codes, IBANs, emails, domains and phone numbers are shown LTR inside `<bdi>`/`dir="ltr"`.
- Currency is **toman** in UI copy (some legacy checkout boxes show rial; keep whichever unit the business confirms).
- Dates use the Jalali calendar (for example ۳۰ مهر ۱۴۰۵).
- Detail views open as **centered popups** (admin users, invoices, services, refunds). The staff detail is a side drawer. The order detail in both panels is a full page.

## Design Tokens
| Token | Value | Use |
|---|---|---|
| ink / navy | `#14213d` | primary text, dark buttons, admin header cards |
| admin sidebar | `#0b1226` | admin sidebar bg |
| user sidebar | `#f3f5f9` + left border `rgba(20,33,61,0.08)` | user panel sidebar |
| primary blue | `#2f6fed` (hover `#2057cd`) | primary CTAs (e.g. «تایید و پرداخت»), links, active nav |
| indigo | `#2f4fa8` | admin badges, secondary actions |
| success | `#1a7f4b` / bg `rgba(26,127,75,0.1)` | |
| warning | `#a8620f` / bg `rgba(217,138,31,0.12)` | |
| danger | `#b0353f` / bg `rgba(176,53,63,0.09)` | |
| purple (refund pending) | `#5b4b9a` / bg `rgba(91,75,154,0.1)` | |
| muted text | `rgba(20,33,61,0.55)`; faint `rgba(20,33,61,0.45)` | |
| surface | `#ffffff`; subtle `#f6f8fc`; field `#f3f5fa`; segmented track `#e9edf5` | |
| borders | `rgba(20,33,61,0.08)` cards, `0.14` outline buttons | |

- **Radii:** admin cards 22px, popups 24px, user-panel cards 16–20px, inputs 12px, admin buttons pill (999px), user-panel buttons 11–12px, chips 999px.
- **Shadows:** popup `0 30px 70px rgba(20,33,61,0.35)`, dropdown `0 26px 60px rgba(20,33,61,0.2)`, primary CTA `0 10px 24px rgba(47,111,237,0.35)`.
- **Type scale:** page title 24/900, section 14–15/900, body 13–13.5/600–800, meta 11.5–12/600–700, KPI 24/900.
- **Overlay:** `rgba(20,33,61,0.45)`.

## Assets
- `uploads/nikso-fa.svg`: dark logo (black wordmark + navy `#092B70` dot), used on white backgrounds (landing, user panel sidebar). It is shown cropped inside a 100×41 box: img 118×103 at left −3px, top −33px.
- `nikso-fa-white.svg`: white logo (white + `#2f6fed`), used on the dark admin sidebar.
- `logos/*.svg`: partner/brand and flag logos for the landing page.
- Service icons are loaded from `https://www.google.com/s2/favicons?domain=<domain>&sz=64`. Replace them with real brand assets.
- `assets/cards-photo.jpg`: landing imagery.

---

## Screens

### Public site
- **Nixopay Landing.dc.html**: header (logo, nav, login), hero, services grid, foreign-payment explainer with the orbit-of-logos visual, blog, contact, FAQ, footer. Per CLAUDE.md, hero banners must not use receipt cards or price tables; use the orbit of logos or the icon + «نمونه پرداخت‌ها» chips box.
- **service-*.dc.html / payment-*.dc.html**: per-service marketing pages (subscriptions, gift cards, payments, shopping, travel, direct, cards, embassy, exams, hotel, premium, SEO, tickets).
- **subscription-plans.dc.html**: plan picker → email for the account → payment box (line items, service fee, final amount) → «تایید و پرداخت» (blue `#2f6fed` with shadow; greyed out until the email is valid). The header has a profile dropdown: name and phone, wallet balance, links to orders, tickets, profile and bank accounts, and a red «خروج از حساب».
- **auth.dc.html / admin-auth.dc.html**: mobile + OTP login. There is no email field at signup.
- **about / contact / terms**: static.

### User panel: panel.dc.html
- **Shell:** 268px light-grey sidebar (`#f3f5f9`). It contains the logo, a «منوی کاربری» group (dashboard, foreign payments, orders, wallet, tickets) and a «خدمات» group (subscriptions, gift cards), then a profile row and a red logout. The active nav item has a white bg, `#2057cd` text and an inset 3px blue bar. The 76px top bar has search, tickets, cart (with badge) and a profile dropdown.
- **Product / gift card checkout:** two steps («انتخاب» → «پرداخت»). The payment box lists items, fee and final amount, with a blue «تایید و پرداخت». The payment loading state shows a minimal «در حال پرداخت…» with a spinner.
- **Orders:** tabs همه / در حال انجام / تحویل شده / لغو شده. Sub-sections cover formal-invoice requests and Nixopay payments (refunds to wallet).
- **Order detail:** status + 5-step progress, specs, related tickets and a cost breakdown.
  - **Cancel / refund request:**
    - In-progress order: card «نیاز به لغو این سفارش دارید؟» → popup.
    - Delivered order: «مشکلی در سفارش تحویل‌شده دارید؟» → popup.
    - Popup fields: radio reasons (different lists for in-progress vs delivered), note (required if «سایر», at least 10 characters), destination (Nixopay wallet / a saved bank account), paid amount + policy text, and a required agreement checkbox.
    - On submit, a tracking card appears with code `CR-48xx` and 3 steps (ثبت درخواست ✓ → بررسی کارشناس (current) → بازگشت وجه), plus «انصراف از درخواست». The order status becomes «درخواست لغو در حال بررسی». **The backend must route this to the admin finance refund queue.**
- **Wallet, Tickets, Profile & KYC, Security, Bank accounts, Referral, Favorites.**

### Admin panel: admin-panel.dc.html
- **Shell:** 260px dark sidebar (`#0b1226`) with a white logo and «پنل مدیریت». There are **7 nav groups**. Groups with several pages render a segmented sub-tab bar at the top of the content (track `#e9edf5`, active tab white). Notification badges appear **only on sub-tabs**, and the last-visited tab is remembered per group.
  1. داشبورد → داشبورد، آمار سرویس‌ها
  2. میز کار → کارتابل، اقدامات، ارجاعات
  3. سفارش‌ها
  4. کاربران و پشتیبانی → کاربران، تیکت‌های پشتیبانی
  5. مالی → نمای مالی، لغو و بازگشت وجه، درخواست‌های برداشت، فاکتورهای رسمی، نرخ ارز و کارمزد
  6. خدمات و محصولات
  7. تنظیمات → تنظیمات عمومی، کارمندان و دسترسی‌ها
- **Dashboard:**
  - Greeting, Jalali calendar button, period switch (7/30/…).
  - 4 KPIs with delta vs previous period.
  - Sales trend bars, service share, top services, order status bars, «در انتظار رسیدگی» queue, latest orders.
- **کارتابل:** kanban board (صف جدید / در حال رسیدگی / منتظر پاسخ / انجام‌شده), priority spotlight task, team workload, status tabs, bulk actions.
- **جلسات:** weekly calendar, current-time line, next-meeting card.
- **اقدامات:** customer requests by type (withdrawal, failed tx, cancelled, refund, ticket), message templates, and wait-time colouring (amber at 2h, red at 4h).
- **ارجاعات:** referral chain between staff with chat, routing, priorities.
- **سفارش‌ها:**
  - List: 7 stage tabs (unpaid, queued, doing, issue, done, canceled + all), filters, bulk actions, CSV export, SLA lateness flags.
  - Detail: progress steps, invoice breakdown (USD × rate + 6% fee), delivery panel per category, assignee, history and notes, customer card.
  - «لغو و بازگشت وجه» (for paid orders): popup with reason, method (کیف پول / کارت پرداخت‌کننده / واریز به شبا with an IBAN check of at least 26 chars), full or partial amount (≤ total) and a note. On submit, a refund request `RF-10xx` is created, the order stage becomes `refund` («در انتظار تأیید مالی»), and a purple banner with «مشاهده در مالی» appears. Unpaid orders cancel directly.
- **مالی → نمای مالی:** five internal tabs (overview with period switch and charts, transactions ledger, accounts and balances with transfers, payouts batch processing, P&L).
- **مالی → لغو و بازگشت وجه:**
  - Tabs: در انتظار تأیید / پرداخت‌شده / ردشده / همه. Stats: pending count + sum, oldest open request, paid count + sum.
  - Table: request, customer, order + reason, refund amount (with a «بخشی از مبلغ» flag), method, sender + wait (amber ≥120 min, red ≥240 min), status.
  - Popup actions:
    - **Approve & pay:** status `paid`, order → `canceled`, and a «بازگشت وجه» transaction is added to the ledger (`موفق` for wallet, `در انتظار` for card/IBAN).
    - **Reject with reason:** order returns to its previous stage.
  - Both actions are logged in the order history as «واحد مالی».
- **مالی → فاکتورهای رسمی:**
  - Tabs: pending / needs fix / issued / void / all. Search, individual/company filter, wait colouring (amber ≥8h, red ≥24h).
  - Popup in two columns: buyer details (company fields: شناسه ملی، کد اقتصادی، شماره ثبت) + history, and a live invoice sheet (seller, buyer, line items, subtotal, service fee, **VAT 10%**, total; «باطل شد» stamp when void).
  - Actions: issue (assigns `NX-1405-NNNN` sequentially), request a fix (reason), send to customer, print/PDF, void (reason). The seller national ID and economic code are placeholders.
- **مالی → درخواست‌های برداشت, نرخ ارز و کارمزد:** withdrawal approve/reject; base USD rate + default fee % (consumed by the services page).
- **کاربران:**
  - Tabs: all / KYC pending / blocked. 4 stats; search (name, mobile, national code), level filter, sort.
  - Popup tabs:
    - **خلاصه:** account info + admin action log.
    - **کیف پول:** manual increase/decrease with a required reason; a decrease cannot exceed the balance; ledger.
    - **سفارش‌ها:** filterable list.
    - **احراز هویت:** 3 levels (mobile → identity → documents); approve to level 2 or reject with reason.
    - **یادداشت‌ها:** internal notes.
  - Block requires a reason and shows a red banner; unblock.
- **تیکت‌ها:** list + detail thread.
- **خدمات و محصولات:**
  - Category tabs (subscriptions / gift cards / foreign payments), 4 stats, search, status filter (active / out of stock / disabled), an inline on/off switch per row.
  - Editor popup: name, category, domain, description, delivery auto/manual + time, status; pricing as fixed plans (title + USD, live toman preview) or customer amount (min/max USD); per-service fee % (empty = default). A sample calculation box shows USD × rate, fee, and the final site price (rounded up to 1,000 toman).
  - Validation: a name, and either at least one valid plan or a valid min < max. Delete needs a second click.
- **کارمندان و دسترسی‌ها:**
  - Tabs: staff (online dot, 2FA flag), roles and permission matrix (14 areas × view / create-edit / delete / approve-export; **blue = role default, orange = per-person override**), activity log, security (IP whitelist, alerts).
  - The invite is a popup with per-person overrides.
- **تنظیمات عمومی, پروفایل من.**

## Interactions & Behaviour (cross-cutting)
- Every table row opens its detail on click. Inline controls (checkboxes, switches) stop propagation.
- Popups close on overlay click or ✕. Popup content scrolls with the scrollbar hidden (`scrollbar-width: none`).
- Success messages are green inline banners inside the popup (`rgba(26,127,75,0.08)` bg). Errors are inline red text under the form.
- CSV exports use a UTF-8 BOM (`\uFEFF`) so Excel shows Persian correctly.
- Wait/SLA colour thresholds:
  - Actions: 2h / 4h.
  - Refunds: 120 / 240 min.
  - Invoices: 8h / 24h.
  - Orders: queued > 60 min, doing > 120 min, issue > 60 min = late.

## State / Backend Requirements
Entities and lifecycles implied by the prototype:
- **Order:** `unpaid → queued → doing → done`, with side states `issue`, `refund` (awaiting finance), `canceled`. It has an assignee, a delivery payload per category and an event log.
- **Customer cancel request (CR):** `pending` → (finance) `approved/paid` | `rejected` | `withdrawn` by the customer. It must create or link a **Refund (RF)**.
- **Refund (RF):** `pending → paid | rejected`. Fields: order, amount (≤ order total), method (wallet/card/IBAN), IBAN, reason, note, requester, timestamps. Paying it creates a ledger transaction and sets the order to `canceled`; rejecting restores the previous order stage.
- **Formal invoice:** `pending → issued (sequential number, date) → sent`, side states `fix` and `void`. VAT 10%.
- **User:** status active/blocked (+ reason), KYC level 0–2 and document status, wallet ledger with manual adjustments (reason + note + actor), notes, admin action log.
- **Service:** category, plans or custom range, fee override, delivery type/time, status, 30-day sales.
- **Staff / roles / permissions** with per-person overrides, sessions, 2FA, IP whitelist, audit log.
- **Exchange rate:** a real source must replace the simulated one.
- Every admin mutation should write an audit entry (actor, action, target, time).

## Files
| File | Contents |
|---|---|
| `Nixopay Landing.dc.html` | public landing |
| `service-*.dc.html`, `payment-*.dc.html` | service marketing pages |
| `subscription-plans.dc.html` | subscription checkout + profile dropdown |
| `auth.dc.html`, `admin-auth.dc.html` | login |
| `about/contact/terms.dc.html` | static pages |
| `panel.dc.html` | full user panel (incl. cancel/refund request) |
| `admin-panel.dc.html` | full admin panel (all modules above) |
| `support.js`, `image-slot.js` | prototype runtime only; not for production |
| `uploads/nikso-fa.svg`, `nikso-fa-white.svg`, `logos/`, `assets/` | brand and imagery |
