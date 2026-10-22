---
name: crypto-exchange-architect
description: Design, scaffold and review an online exchange (crypto/fiat) with a React frontend and a NestJS microservice backend - API Gateway, database-per-service, an isolated payment core with a hash-chained (blockchain-style) ledger, 5 security layers, and a limit of one payment request per IP per day. Use when the user asks to build, extend, review or document any part of an exchange, wallet, payment core, gateway, or security layers for such a system ("صرافی", "exchange", "payment core", "هسته پرداخت", "API gateway").
---

# معمار صرافی آنلاین (React + NestJS Microservices + Blockchain Ledger)

این اسکیل چارچوب ثابتی برای ساخت/بازبینی یک صرافی آنلاین است. هر کدی که تولید می‌کنی باید با **قواعد اجباری** پایین سازگار باشد. جزئیات در فایل‌های `references/` و نمونه‌کدها در `templates/` است؛ فقط وقتی لازم شد آن‌ها را بخوان.

| فایل | کی بخوانی |
|------|-----------|
| `references/architecture.md` | ساختار سرویس‌ها، دیتابیس‌ها، ارتباطات، ساختار پوشه‌ها |
| `references/security-layers.md` | پیاده‌سازی هر کدام از ۵ لایه امنیتی |
| `references/payment-core.md` | هسته پرداخت، لجر زنجیره‌ای (blockchain)، کیف پول‌ها |
| `references/exchange-requirements.md` | الزامات حقوقی، عملیاتی و فنی یک صرافی (داکیومنت تحویلی) |
| `templates/` | کد آماده: گارد محدودیت IP، بلاک لجر، docker-compose، گیت‌وی |

---

## ۱. استک فنی (غیرقابل تغییر مگر کاربر بگوید)

- **Frontend:** اپ موجود در ریشه همین مخزن — Next.js 16 (App Router) + React 19 + TypeScript (نیکسوپی، RTL). صفحه‌ها از `docs/design-handoff` با `npm run convert` تولید می‌شوند؛ فایل‌های تولیدشده را دستی ویرایش نکن. برای اتصال به بکند فقط لایه داده (`src/shared/api` و logicها) را به API Gateway وصل کن. WebSocket برای نرخ و وضعیت سفارش زنده.
- **Backend:** NestJS (TypeScript) در قالب **Monorepo** (Nx یا Nest CLI monorepo)، هر سرویس یک app مستقل.
- **ارتباط بین سرویس‌ها:** همگام: gRPC روی mTLS — ناهمگام: Kafka (یا NATS JetStream) با الگوی Outbox.
- **API Gateway:** یک سرویس NestJS مستقل (`apps/api-gateway`) — تنها نقطه ورودی عمومی. (در production پشت Nginx/Envoy + WAF.)
- **Cache / Rate limit:** Redis (کلاستر جدا برای گیت‌وی).
- **Blockchain:** لجر داخلی هش‌زنجیره‌ای + Merkle root که دوره‌ای روی یک بلاک‌چین عمومی (مثلاً Ethereum/Polygon) anchor می‌شود؛ ارتباط با شبکه‌ها برای واریز/برداشت از طریق `blockchain-service` (ethers.js / bitcoinjs-lib / TronWeb).
- **زیرساخت:** Docker، Kubernetes، Vault (Secrets/KMS)، Prometheus + Grafana + Loki، OpenTelemetry.

## ۲. سرویس‌ها و دیتابیس هر سرویس (Database-per-Service)

| سرویس | مسئولیت | دیتابیس |
|-------|---------|---------|
| `api-gateway` | مسیریابی، احراز توکن، rate limit، محدودیت IP روزانه | Redis (بدون DB رابطه‌ای) |
| `auth-service` | ثبت‌نام، لاگین، JWT، 2FA، نشست‌ها، دستگاه‌ها | PostgreSQL `auth_db` |
| `user-service` | پروفایل، تنظیمات | PostgreSQL `user_db` |
| `kyc-service` | احراز هویت، مدارک، سطح کاربری | PostgreSQL `kyc_db` + Object Storage رمزنگاری‌شده |
| `market-service` | جفت‌ارزها، قیمت، کندل | TimescaleDB `market_db` |
| `order-service` | ثبت/لغو سفارش | PostgreSQL `order_db` |
| `matching-engine` | تطبیق سفارش‌ها (in-memory، event-sourced) | Redis + Kafka log |
| `wallet-service` | آدرس‌ها، موجودی نمایشی (read model) | PostgreSQL `wallet_db` |
| **`payment-core`** | **تنها مرجع پول: لجر، تراکنش، تسویه** | PostgreSQL `payment_db` (ایزوله، شبکه جدا) |
| `blockchain-service` | نودها، واریز/برداشت روی‌زنجیره، anchor کردن Merkle root | PostgreSQL `chain_db` |
| `notification-service` | ایمیل، SMS، پوش | MongoDB `notify_db` |
| `audit-service` | لاگ‌های غیرقابل تغییر امنیتی | ClickHouse / append-only `audit_db` |
| `risk-service` | AML، تشخیص تقلب، محدودیت‌ها | PostgreSQL `risk_db` |

قواعد دیتابیس:
- هیچ سرویسی به دیتابیس سرویس دیگر **وصل نمی‌شود**؛ فقط API یا Event.
- هر سرویس یوزر دیتابیس، رمز و migration مخصوص خودش را دارد (TypeORM/Prisma migrations داخل همان app).
- داده‌های مشترک فقط از طریق event (`user.created`, `kyc.approved`, `payment.settled`) تکثیر می‌شوند.
- تراکنش توزیع‌شده = **Saga** (orchestration در `payment-core`) + Outbox، نه 2PC.

## ۳. قواعد اجباری

1. **هسته پرداخت جداست:** `payment-core` در namespace و شبکه جدا اجرا می‌شود، فقط از طریق gRPC داخلی با mTLS از `api-gateway`/`order-service`/`wallet-service` قابل دسترسی است، هیچ endpoint عمومی ندارد، و تنها سرویسی است که موجودی واقعی را تغییر می‌دهد.
2. **لجر بلاک‌چینی:** هر تراکنش در `payment-core` یک ورودی append-only دوطرفه (double-entry) است که هش ورودی قبلی را دارد؛ ورودی‌ها در بلاک‌ها جمع شده، Merkle root محاسبه و امضا می‌شود و دوره‌ای روی زنجیره عمومی anchor می‌شود. `UPDATE`/`DELETE` روی جدول لجر با Trigger/Permission ممنوع است. اصلاح فقط با تراکنش معکوس. (جزئیات: `references/payment-core.md`)
3. **۵ لایه امنیتی** همیشه پیاده می‌شود (جزئیات: `references/security-layers.md`):
   1. لایه شبکه و لبه (WAF، DDoS، TLS 1.3، CDN)
   2. لایه API Gateway (rate limit، **محدودیت IP روزانه**، اعتبارسنجی schema، CORS/CSP)
   3. لایه هویت و دسترسی (JWT کوتاه‌عمر + refresh rotation، 2FA اجباری برای برداشت، RBAC/ABAC، device binding)
   4. لایه ارتباط سرویس‌ها (Zero Trust، mTLS، امضای درخواست HMAC، Idempotency-Key)
   5. لایه داده و هسته پرداخت (رمزنگاری at-rest با KMS/HSM، لجر هش‌زنجیره‌ای، کیف پول سرد/گرم multi-sig، audit log غیرقابل تغییر)
4. **هر IP فقط یک درخواست پرداخت در روز:** در `api-gateway` با گارد `PaymentIpDailyLimitGuard` روی همه مسیرهای `POST /api/v1/payments/*`:
   - کلید Redis: `payment:ip:{ip}:{YYYY-MM-DD}` با `SET NX` و انقضا تا پایان روز (منطقه زمانی قابل تنظیم، پیش‌فرض `Asia/Tehran`).
   - IP واقعی فقط از `X-Forwarded-For` پشت proxyهای مورد اعتماد (`TRUSTED_PROXIES`) خوانده شود؛ در غیر این صورت `req.socket.remoteAddress`.
   - IPv6 به پیشوند `/64` نرمال شود تا دور زدن با چرخش آدرس سخت شود.
   - در صورت تکرار: HTTP `429` با `Retry-After` و ثبت رویداد در `audit-service`.
   - درخواست ناموفق در اعتبارسنجی (۴xx قبل از رسیدن به payment-core) سهمیه را مصرف نمی‌کند؛ درخواستی که به payment-core رسید مصرف می‌کند.
   - کد آماده: `templates/payment-ip-daily-limit.guard.ts`
5. **API Gateway تنها ورودی است:** همه درخواست‌های فرانت به `https://api.<domain>/api/v1/...` می‌روند؛ سرویس‌های داخلی هیچ Ingress عمومی ندارند. کد نمونه: `templates/api-gateway.md`.
6. **پول هرگز float نیست:** مبالغ به صورت `bigint` در کوچک‌ترین واحد (satoshi/wei/ریال) یا `NUMERIC(38,18)`؛ در TS از `bigint` یا `decimal.js`.
7. **Idempotency:** هر درخواست پرداخت/برداشت/سفارش باید `Idempotency-Key` داشته باشد؛ payment-core کلید را در `payment_db` با unique constraint ذخیره می‌کند.
8. **هیچ secret در کد یا repo نیست:** همه از Vault/K8s Secrets؛ کلیدهای خصوصی کیف پول فقط در HSM/MPC.

## ۴. ساختار پروژه

```
exchange/                         # فرانت Next.js در ریشه (موجود)
├── src/{app,screens,dc}          # صفحه‌های تولیدشده + runtime
├── src/shared/{api,ws,security}  # کلاینت API Gateway (جدید)
├── docs/design-handoff/          # منبع طراحی
├── backend/                      # NestJS monorepo
│   ├── apps/
│   │   ├── api-gateway/
│   │   ├── auth-service/  user-service/  kyc-service/
│   │   ├── market-service/  order-service/  matching-engine/
│   │   ├── wallet-service/  payment-core/  blockchain-service/
│   │   └── notification-service/  audit-service/  risk-service/
│   ├── libs/
│   │   ├── common/        # DTO پایه، فیلترها، interceptors
│   │   ├── security/      # گاردها، HMAC، mTLS helpers
│   │   ├── contracts/     # فایل‌های .proto و schema رویدادها
│   │   └── ledger/        # هش، Merkle، امضای بلاک
│   └── nest-cli.json
├── infra/{docker-compose.yml,k8s/,vault/,monitoring/}
└── docs/                         # از references/exchange-requirements.md
```

## ۵. روند کار وقتی کاربر چیزی می‌خواهد

1. **ساخت پروژه از صفر:** ساختار بالا را بساز، `templates/docker-compose.yml` را در `infra/` بگذار، برای هر سرویس `main.ts`، ماژول، DTO، entity و migration بنویس؛ ابتدا `api-gateway`، `auth-service` و `payment-core` را کامل کن.
2. **افزودن یک سرویس جدید:** دیتابیس خودش، قرارداد `.proto` در `libs/contracts`، ثبت route در گیت‌وی، health check، metrics و تست.
3. **هر تغییری که به پول مربوط است:** فقط داخل `payment-core`، با تراکنش double-entry، Idempotency، و ورودی لجر؛ تست invariant «مجموع بدهکار = مجموع بستانکار» و «زنجیره هش معتبر است» اضافه کن.
4. **بازبینی کد:** با چک‌لیست بخش ۶ بررسی کن و تخطی از قواعد بخش ۳ را با شدت «بحرانی» گزارش کن.
5. **مستندات:** برای داکیومنت تحویلی، `references/exchange-requirements.md` را مبنا قرار بده و در `docs/` پروژه کپی/تکمیل کن.

## ۶. چک‌لیست بازبینی

- [ ] سرویسی به DB سرویس دیگر وصل نشده
- [ ] payment-core endpoint عمومی ندارد و فقط با mTLS در دسترس است
- [ ] جدول لجر append-only است و `prev_hash`/`hash` دارد؛ تست اعتبار زنجیره وجود دارد
- [ ] گارد IP روزانه روی همه مسیرهای پرداخت فعال است و IP از proxy غیرمعتبر پذیرفته نمی‌شود
- [ ] مبالغ float نیستند
- [ ] Idempotency-Key روی پرداخت/برداشت/سفارش اجباری است
- [ ] برداشت نیاز به 2FA + whitelist آدرس + تأخیر امنیتی برای آدرس جدید دارد
- [ ] ورودی‌ها با `class-validator` و `whitelist: true, forbidNonWhitelisted: true` اعتبارسنجی می‌شوند
- [ ] لاگ‌ها داده حساس (رمز، توکن، کلید، شماره کارت کامل) ندارند
- [ ] health/readiness، metrics و tracing برای سرویس جدید فعال است
