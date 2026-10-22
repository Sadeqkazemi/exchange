# هسته پرداخت (payment-core) و لجر بلاک‌چینی

## اصول
- تنها سرویسی که موجودی را تغییر می‌دهد. سایر سرویس‌ها read model دارند.
- Double-entry: هر تراکنش حداقل دو posting دارد که جمعشان صفر است.
- Append-only + hash chain + Merkle block + anchor عمومی = عدم امکان دستکاری پنهان.
- استقرار جدا: namespace، node pool، دیتابیس، کلیدها و تیم دسترسی جدا.

## API داخلی (gRPC) — `libs/contracts/payment.proto`

```proto
syntax = "proto3";
package payment.v1;

service PaymentCore {
  rpc CreatePayment (CreatePaymentRequest) returns (PaymentResult);
  rpc ReserveFunds  (ReserveRequest)       returns (PaymentResult);
  rpc ReleaseFunds  (ReleaseRequest)       returns (PaymentResult);
  rpc Settle        (SettleRequest)        returns (PaymentResult);
  rpc Transfer      (TransferRequest)      returns (PaymentResult); // trade settlement
  rpc GetBalance    (BalanceRequest)       returns (BalanceResponse);
  rpc VerifyChain   (VerifyRequest)        returns (VerifyResponse);
}

message CreatePaymentRequest {
  string idempotency_key = 1;
  string user_id = 2;
  string asset = 3;          // "IRR", "USDT", "BTC"
  string amount = 4;         // integer string in smallest unit
  string client_ip = 5;      // stamped by api-gateway, for audit
  string method = 6;         // "bank_gateway" | "crypto"
}
message PaymentResult { string tx_id = 1; string status = 2; string ledger_hash = 3; }
message ReserveRequest { string idempotency_key = 1; string user_id = 2; string asset = 3; string amount = 4; string reason = 5; }
message ReleaseRequest { string idempotency_key = 1; string reservation_id = 2; }
message SettleRequest  { string idempotency_key = 1; string reservation_id = 2; string external_ref = 3; }
message TransferRequest { string idempotency_key = 1; repeated Posting postings = 2; string reason = 3; }
message Posting { string account_id = 1; string asset = 2; string amount = 3; } // signed amount
message BalanceRequest { string user_id = 1; string asset = 2; }
message BalanceResponse { string available = 1; string locked = 2; }
message VerifyRequest { uint64 from_block = 1; uint64 to_block = 2; }
message VerifyResponse { bool valid = 1; uint64 first_invalid_block = 2; }
```

## اسکیمای `payment_db`

```sql
CREATE TABLE accounts (
  id          UUID PRIMARY KEY,
  owner_id    UUID,                       -- null for system accounts
  asset       VARCHAR(16) NOT NULL,
  kind        VARCHAR(16) NOT NULL,       -- available | locked | fee | hot_wallet | cold_wallet | bank | external
  UNIQUE (owner_id, asset, kind)
);

CREATE TABLE ledger_entries (
  seq          BIGSERIAL PRIMARY KEY,
  tx_id        UUID NOT NULL,
  account_id   UUID NOT NULL REFERENCES accounts(id),
  asset        VARCHAR(16) NOT NULL,
  amount       NUMERIC(38,0) NOT NULL,    -- signed, smallest unit
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash    CHAR(64) NOT NULL,
  hash         CHAR(64) NOT NULL UNIQUE,
  block_no     BIGINT                      -- filled when sealed into a block
);

CREATE TABLE ledger_blocks (
  block_no     BIGINT PRIMARY KEY,
  first_seq    BIGINT NOT NULL,
  last_seq     BIGINT NOT NULL,
  merkle_root  CHAR(64) NOT NULL,
  prev_block_hash CHAR(64) NOT NULL,
  block_hash   CHAR(64) NOT NULL,
  signature    TEXT NOT NULL,             -- signed by KMS/HSM key
  anchor_tx    VARCHAR(100),              -- public chain tx hash
  sealed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE balances (                    -- projection, updated in same DB tx
  account_id UUID PRIMARY KEY REFERENCES accounts(id),
  amount     NUMERIC(38,0) NOT NULL,
  allow_negative BOOLEAN NOT NULL DEFAULT false,   -- true only for system accounts (external, bank)
  CHECK (allow_negative OR amount >= 0)
);

CREATE TABLE idempotency_keys (
  key        VARCHAR(100) PRIMARY KEY,
  request_hash CHAR(64) NOT NULL,
  response   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  id UUID PRIMARY KEY, topic VARCHAR(100) NOT NULL, payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ
);

-- append-only enforcement
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, ledger_blocks FROM payment_app;
GRANT UPDATE (block_no) ON ledger_entries TO payment_app;   -- sealer only sets block_no
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW WHEN (OLD.block_no IS NOT NULL) EXECUTE FUNCTION forbid_mutation();
```

> موجودی‌ها در همان تراکنش DB با `SELECT ... FOR UPDATE` قفل و به‌روز می‌شوند؛ `CHECK` جلوی منفی شدن حساب کاربر را در سطح دیتابیس هم می‌گیرد.
> تنها UPDATE مجاز روی `ledger_entries` پر کردن `block_no` توسط sealer است (ستونی که در هش شرکت ندارد).

## الگوریتم هش و بلاک
- `hash = SHA256(prev_hash || tx_id || account_id || asset || amount || created_at_iso)` — کانونیکال و با جداکننده ثابت.
- `prev_hash` اولین ورودی = `"0" * 64` (genesis).
- درج ورودی‌ها با `pg_advisory_xact_lock` سراسری لجر انجام می‌شود تا ترتیب زنجیره قطعی باشد (یا یک writer واحد با صف).
- Sealer هر N ورودی یا هر ۶۰ ثانیه: Merkle root ورودی‌ها → `block_hash = SHA256(prev_block_hash || merkle_root || last_seq)` → امضا با کلید KMS.
- Anchor: هر ساعت آخرین `block_hash` در یک تراکنش (مثلاً فیلد data یا یک قرارداد `Anchor.sol`) روی شبکه عمومی ثبت می‌شود → امکان ممیزی مستقل و Proof of Reserves.
- `VerifyChain` به‌صورت cron هر ۱۵ دقیقه؛ شکست = هشدار بحرانی + توقف برداشت.

کد نمونه: `templates/ledger.service.ts`.

## Proof of Reserves
- Merkle tree از موجودی کاربران (هش `user_id + balance + nonce`) منتشر می‌شود؛ هر کاربر می‌تواند عضویت خود را بررسی کند.
- آدرس‌های کیف پول صرافی و امضای مالکیت آن‌ها منتشر می‌شود.

## درگاه پرداخت ریالی (در صورت وجود)
- اتصال به PSP/شاپرک فقط از `payment-core` (ماژول `fiat-gateway` داخل همان سرویس یا سرویس آداپتر ایزوله).
- verify دوباره تراکنش با API بانک قبل از شارژ لجر (هرگز به callback تنها اعتماد نکن).
- کارت بانکی کاربر باید به نام خود او و تأیید‌شده در KYC باشد.
