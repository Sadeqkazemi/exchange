// apps/api-gateway/src/security/payment-ip-daily-limit.guard.ts
// One payment request per client IP per calendar day (security layer 2).
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import * as ipaddr from 'ipaddr.js';
import { AuditClient } from '../audit/audit.client';

export const REDIS = Symbol('REDIS');

@Injectable()
export class PaymentIpDailyLimitGuard implements CanActivate {
  private readonly timeZone: string;
  private readonly trustedProxies: Set<string>;
  private readonly whitelist: Set<string>;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly audit: AuditClient,
    config: ConfigService,
  ) {
    this.timeZone = config.get('PAYMENT_LIMIT_TZ', 'Asia/Tehran');
    this.trustedProxies = new Set(csv(config.get('TRUSTED_PROXIES', '')));
    this.whitelist = new Set(csv(config.get('PAYMENT_IP_WHITELIST', '')));
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const ip = this.clientIp(req);
    if (this.whitelist.has(ip)) return true;

    const { day, secondsLeft } = this.today();
    const key = `payment:ip:${ip}:${day}`;

    // Atomic: only the first request of the day creates the key.
    const created = await this.redis.set(key, req.header('x-request-id') ?? '1', 'EX', secondsLeft, 'NX');
    if (created === 'OK') {
      // Let the controller release the slot if validation fails before payment-core is called.
      (req as any).paymentLimitKey = key;
      return true;
    }

    await this.audit.log('payment.ip_limit_exceeded', { ip, day, path: req.path });
    res.setHeader('Retry-After', String(secondsLeft));
    throw new HttpException(
      { code: 'PAYMENT_DAILY_LIMIT', message: 'Only one payment request per IP per day is allowed.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Call when the request is rejected before reaching payment-core (e.g. 4xx validation). */
  static async release(redis: Redis, req: Request): Promise<void> {
    const key = (req as any).paymentLimitKey;
    if (key) await redis.del(key);
  }

  private clientIp(req: Request): string {
    const remote = normalize(req.socket.remoteAddress ?? '');
    // Only trust X-Forwarded-For when the direct peer is one of our proxies.
    if (this.trustedProxies.has(remote)) {
      const chain = (req.header('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      // Walk from the right, skipping our own proxies; the first untrusted hop is the client.
      for (let i = chain.length - 1; i >= 0; i--) {
        const hop = normalize(chain[i]);
        if (!this.trustedProxies.has(hop)) return bucket(hop);
      }
    }
    return bucket(remote);
  }

  private today(): { day: string; secondsLeft: number } {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const day = `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`;
    const elapsed = get('hour') * 3600 + get('minute') * 60 + get('second');
    return { day, secondsLeft: Math.max(1, 86400 - elapsed) };
  }
}

function csv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean).map(normalize);
}

/** Strip IPv4-mapped IPv6 (::ffff:1.2.3.4) and canonicalise. */
function normalize(ip: string): string {
  try {
    const addr = ipaddr.process(ip);
    return addr.toString();
  } catch {
    return ip;
  }
}

/** IPv4 → full address; IPv6 → /64 prefix so rotating within a subnet does not bypass the limit. */
function bucket(ip: string): string {
  try {
    const addr = ipaddr.parse(ip);
    if (addr.kind() === 'ipv6') {
      const parts = (addr as ipaddr.IPv6).parts.slice(0, 4).map((p) => p.toString(16));
      return `${parts.join(':')}::/64`;
    }
    return addr.toString();
  } catch {
    return ip;
  }
}

/*
Usage in api-gateway:

@Controller('api/v1/payments')
@UseGuards(JwtAuthGuard, PaymentIpDailyLimitGuard)
export class PaymentsController {
  constructor(private readonly payment: PaymentCoreClient, @Inject(REDIS) private readonly redis: Redis) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreatePaymentDto, @Headers('idempotency-key') key: string) {
    if (!key) {
      await PaymentIpDailyLimitGuard.release(this.redis, req);
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.payment.createPayment({ ...dto, idempotencyKey: key, userId: req.user.id, clientIp: req.ip });
  }
}

Note: global ValidationPipe runs after guards, so DTO validation failures also need
an exception filter on this controller that calls PaymentIpDailyLimitGuard.release().
*/
