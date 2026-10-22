# API Gateway (NestJS) — نمونه

## `apps/api-gateway/src/main.ts`

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Socket peer is used; X-Forwarded-For is only honoured for TRUSTED_PROXIES inside the guards.
  app.use(json({ limit: '100kb' }));
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  }));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_ORIGINS!.split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(3000);
}
bootstrap();
```

## `apps/api-gateway/src/app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { credentials } from '@grpc/grpc-js';
import { readFileSync } from 'fs';
import Redis from 'ioredis';
import { REDIS } from './security/payment-ip-daily-limit.guard';

const mtls = () =>
  credentials.createSsl(
    readFileSync('/etc/tls/ca.crt'),
    readFileSync('/etc/tls/tls.key'),
    readFileSync('/etc/tls/tls.crt'),
  );

const grpc = (name: string, pkg: string, proto: string, url: string) => ({
  name,
  transport: Transport.GRPC as const,
  options: { package: pkg, protoPath: `libs/contracts/${proto}`, url, credentials: mtls() },
});

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL),
    }),
    ClientsModule.register([
      grpc('AUTH',    'auth.v1',    'auth.proto',    'auth-service:50051'),
      grpc('ORDER',   'order.v1',   'order.proto',   'order-service:50051'),
      grpc('WALLET',  'wallet.v1',  'wallet.proto',  'wallet-service:50051'),
      grpc('PAYMENT', 'payment.v1', 'payment.proto', 'payment-core:50051'),
      grpc('MARKET',  'market.v1',  'market.proto',  'market-service:50051'),
      grpc('KYC',     'kyc.v1',     'kyc.proto',     'kyc-service:50051'),
    ]),
  ],
  providers: [
    { provide: REDIS, useFactory: () => new Redis(process.env.REDIS_URL!) },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  // controllers: AuthController, OrdersController, WalletController, PaymentsController, MarketController, KycController
})
export class AppModule {}
```

## جدول مسیرها

| مسیر عمومی | سرویس مقصد | گاردها |
|------------|------------|--------|
| `POST /api/v1/auth/{register,login,refresh,2fa}` | auth-service | Throttle(20/min), CAPTCHA |
| `GET/PUT /api/v1/users/me` | user-service | JWT |
| `POST /api/v1/kyc/*` | kyc-service | JWT |
| `GET /api/v1/markets/*` | market-service | عمومی + Throttle |
| `POST/DELETE /api/v1/orders` | order-service | JWT, KYC≥1, Idempotency |
| `GET /api/v1/wallets/*` | wallet-service | JWT |
| `POST /api/v1/wallets/withdraw` | wallet-service → payment-core | JWT, 2FA, KYC≥1, Whitelist, Idempotency |
| `POST /api/v1/payments/*` | **payment-core** | JWT, KYC≥1, **PaymentIpDailyLimitGuard**, Idempotency |
| `WS /ws` | market/order (stream) | توکن در اولین پیام |

## هدرهای داخلی
گیت‌وی پس از احراز هویت هدرهای `x-user-id`, `x-kyc-level`, `x-client-ip`, `x-request-id` را به‌صورت gRPC metadata می‌فرستد و با HMAC (`x-gw-signature`) امضا می‌کند؛ سرویس‌ها metadata بدون امضای معتبر را رد می‌کنند. هر هدر `x-*` دریافتی از کلاینت قبل از forward حذف می‌شود.
