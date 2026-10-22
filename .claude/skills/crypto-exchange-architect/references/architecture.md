# معماری کلی

## نمای کلی جریان درخواست

```
[React SPA] ──HTTPS/WSS──► [CDN + WAF + DDoS Protection]          ← لایه ۱
                                   │
                                   ▼
                          [Nginx/Envoy Ingress]
                                   │
                                   ▼
                     ┌──────── [API Gateway (NestJS)] ────────┐    ← لایه ۲ و ۳
                     │  rate limit · IP daily limit · JWT     │
                     │  schema validation · routing · BFF     │
                     └───┬──────────┬──────────┬──────────┬───┘
                 gRPC+mTLS│          │          │          │       ← لایه ۴
                         ▼          ▼          ▼          ▼
                     auth-svc   order-svc  wallet-svc  market-svc ...
                                   │          │
                                   ▼          ▼
                    ┌──────────── payment-core (isolated) ─────┐   ← لایه ۵
                    │  double-entry hash-chained ledger        │
                    │  saga orchestrator · settlement          │
                    └──────────────┬───────────────────────────┘
                                   │ events (Kafka, outbox)
                                   ▼
                          blockchain-service ──► BTC / ETH / TRON nodes
                                   │
                                   └──► anchor Merkle root on public chain
```

## الگوهای ارتباطی

| نوع | فناوری | کاربرد |
|-----|--------|--------|
| Client → Gateway | REST (JSON) + WebSocket | همه درخواست‌های کاربر، اردربوک و قیمت زنده |
| Gateway → Service | gRPC روی mTLS | درخواست‌های همگام |
| Service ↔ Service | Kafka topics | رویدادهای دامنه (`order.placed`, `trade.executed`, `payment.settled`, `deposit.confirmed`) |
| Outbox | جدول `outbox` در DB هر سرویس + relay | تضمین «ذخیره در DB و انتشار رویداد» به‌صورت اتمیک |

## Saga نمونه: برداشت رمزارز

1. `wallet-service` درخواست را از گیت‌وی می‌گیرد (2FA و whitelist قبلاً در گیت‌وی/auth بررسی شده).
2. gRPC به `payment-core.ReserveFunds` → ورودی لجر `available → locked`.
3. `risk-service` رویداد را بررسی می‌کند (AML، سقف روزانه، آدرس‌های تحریمی).
4. در صورت تأیید، `blockchain-service` تراکنش را از کیف گرم (یا با تأیید چندامضایی از کیف سرد) امضا و ارسال می‌کند.
5. پس از N تأیید شبکه، `payment-core.Settle` → ورودی لجر `locked → external`.
6. در صورت خطا در هر مرحله: تراکنش جبرانی `locked → available`.

## WebSocket
- اتصال WSS فقط از گیت‌وی؛ توکن در اولین پیام (نه در URL) ارسال شود.
- کانال‌های عمومی (ticker, orderbook) و خصوصی (orders, balances) جدا؛ کانال خصوصی نیاز به JWT معتبر دارد.

## Frontend (Next.js + React)
- اپ Next.js موجود در ریشه مخزن؛ صفحه‌ها تولیدی‌اند (`npm run convert`) و منطق در `src/screens/<name>/logic.js` است — داده‌های نمونه را با فراخوانی API Gateway جایگزین کن.
- Access token فقط در حافظه (state)، refresh token در کوکی `HttpOnly; Secure; SameSite=Strict`.
- همه درخواست‌ها از یک `apiClient` (axios) با interceptor برای refresh، `Idempotency-Key` (uuid v4) و هدر CSRF.
- CSP سخت‌گیرانه، بدون `dangerouslySetInnerHTML`، Subresource Integrity برای فایل‌های استاتیک.
- اعداد مالی با `decimal.js` نمایش داده شوند، نه `Number`.

## مقیاس‌پذیری و دسترس‌پذیری
- هر سرویس stateless (به‌جز matching-engine که هر جفت‌ارز یک partition/لیدر دارد).
- HPA در Kubernetes بر اساس CPU و طول صف Kafka.
- PostgreSQL با replication (Patroni) و backup رمزنگاری‌شده + تست بازیابی ماهانه.
- اهداف: Availability ≥ 99.9٪، تأخیر p99 ثبت سفارش < 50ms (داخل موتور تطبیق).
