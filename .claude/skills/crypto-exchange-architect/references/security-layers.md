# ۵ لایه امنیتی

هر لایه مستقل فرض می‌کند لایه قبلی ممکن است شکسته شده باشد (Defense in Depth).

## لایه ۱ — شبکه و لبه (Edge / Network)
- CDN + WAF (Cloudflare / AWS WAF) با قوانین OWASP CRS، مسدودسازی کشورهای تحریمی/پرخطر طبق سیاست حقوقی.
- محافظت DDoS لایه ۳/۴/۷، Bot management و CAPTCHA تطبیقی روی لاگین/ثبت‌نام/پرداخت.
- فقط TLS 1.3 (یا 1.2 با cipherهای قوی)، HSTS preload، OCSP stapling.
- Kubernetes NetworkPolicy: پیش‌فرض deny-all؛ فقط Ingress → Gateway باز است.
- `payment-core` و دیتابیس‌ها در subnet خصوصی بدون مسیر اینترنت؛ egress فقط به `blockchain-service`.
- دسترسی ادمین فقط از VPN/Bastion با MFA.

## لایه ۲ — API Gateway
- **Rate limit عمومی:** `@nestjs/throttler` با Redis storage — مثلاً 100 req/min برای کاربر، 20 req/min برای مسیرهای auth.
- **محدودیت روزانه پرداخت به ازای IP:** یک درخواست در روز (`templates/payment-ip-daily-limit.guard.ts`).
- **اعتبارسنجی ورودی:** `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`، محدودیت اندازه body (مثلاً 100KB).
- **هدرهای امنیتی:** `helmet()` با CSP، `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **CORS:** فقط دامنه‌های فرانت؛ `credentials: true`.
- **CSRF:** Double-submit token برای درخواست‌های مبتنی بر کوکی.
- حذف هدرهای داخلی ورودی (`x-user-id`, `x-internal-*`) قبل از forward؛ گیت‌وی خودش آن‌ها را بعد از احراز می‌سازد و امضا می‌کند.
- Request ID (`x-request-id`) برای tracing.

## لایه ۳ — هویت و دسترسی (IAM)
- رمز عبور با **Argon2id**، سیاست رمز قوی، بررسی در لیست رمزهای لو رفته (k-anonymity).
- Access JWT با عمر ۵–۱۵ دقیقه (امضای `ES256`/`EdDSA`، کلید در Vault، JWKS با rotation)؛ refresh token با rotation و تشخیص reuse.
- **2FA:** TOTP یا WebAuthn؛ برای برداشت، تغییر رمز، افزودن آدرس و ساخت API key اجباری.
- Device binding و هشدار ورود از دستگاه/IP جدید؛ قفل حساب پس از تلاش‌های ناموفق (با backoff).
- RBAC برای ادمین‌ها (`support`, `compliance`, `finance`, `superadmin`) + اصل حداقل دسترسی؛ عملیات حساس ادمین نیاز به تأیید دو نفره (four-eyes).
- API key کاربران: محدودیت IP، scope (read / trade / withdraw جدا)، امضای HMAC هر درخواست با timestamp و nonce.
- Anti-phishing code در ایمیل‌ها.

## لایه ۴ — ارتباط بین سرویس‌ها (Zero Trust)
- **mTLS** بین همه سرویس‌ها (Istio/Linkerd یا گواهی‌های cert-manager)؛ هر سرویس هویت SPIFFE دارد.
- Authorization policy: مثلاً فقط `order-service`, `wallet-service`, `api-gateway` مجاز به فراخوانی `payment-core` هستند.
- امضای HMAC بدنه درخواست‌های حساس + timestamp (پنجره ±30 ثانیه) + nonce در Redis برای جلوگیری از replay.
- `Idempotency-Key` اجباری روی همه عملیات مالی.
- Kafka با SASL/SCRAM + TLS و ACL برای هر topic؛ پیام‌های مالی امضا می‌شوند.
- Circuit breaker و timeout روی همه فراخوانی‌ها.

## لایه ۵ — داده و هسته پرداخت
- رمزنگاری at-rest (TDE دیتابیس + رمزنگاری سطح فیلد برای PII با envelope encryption از KMS).
- **لجر هش‌زنجیره‌ای** با Merkle root امضاشده و anchor روی بلاک‌چین عمومی (`references/payment-core.md`).
- کیف پول: ≥ ۹۰٪ دارایی رمزارزی در **کیف سرد** چندامضایی (حداقل ۲ از ۳، ترجیحاً ۳ از ۵ — SEC-KEY-03) یا MPC؛ کیف گرم با سقف موجودی و پرکردن خودکار با تأیید چندنفره.
- کلیدها فقط در HSM / MPC؛ هیچ کلید خصوصی در دیتابیس یا متغیر محیطی.
- Reconciliation خودکار هر ساعت: موجودی لجر = موجودی روی‌زنجیره + موجودی بانکی؛ اختلاف = توقف برداشت و هشدار.
- Audit log غیرقابل تغییر (WORM / append-only) برای همه عملیات کاربر و ادمین.
- Backup رمزنگاری‌شده، offsite، با تست بازیابی.

## پایش و پاسخ به حادثه (پوشش عرضی)
- SIEM (Wazuh/ELK) با هشدار برای: الگوی برداشت غیرعادی، شکست زنجیره هش، اختلاف reconciliation، تلاش دور زدن محدودیت IP.
- Kill switch: توقف سراسری برداشت با یک دستور (نیاز به دو تأیید).
- Pentest سالانه، Bug bounty، اسکن وابستگی‌ها (Snyk/Dependabot) و SAST در CI.
