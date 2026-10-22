// apps/payment-core/src/ledger/ledger.service.ts
// Append-only, double-entry, hash-chained ledger (blockchain-style) — security layer 5.
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { KmsSigner } from '../crypto/kms-signer';

const GENESIS = '0'.repeat(64);
const LEDGER_LOCK = 7_340_001; // pg advisory lock id for the ledger writer

export interface Posting {
  accountId: string;
  asset: string;
  amount: bigint; // signed, smallest unit
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function entryHash(prev: string, txId: string, p: Posting, createdAt: string): string {
  return sha256([prev, txId, p.accountId, p.asset, p.amount.toString(), createdAt].join('|'));
}

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return GENESIS;
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256(level[i] + (level[i + 1] ?? level[i])));
    }
    level = next;
  }
  return level[0];
}

@Injectable()
export class LedgerService {
  constructor(private readonly ds: DataSource, private readonly signer: KmsSigner) {}

  /** Records one balanced transaction atomically, idempotent on `idempotencyKey`. */
  async post(idempotencyKey: string, postings: Posting[]): Promise<{ txId: string; hash: string }> {
    this.assertBalanced(postings);
    const requestHash = sha256(JSON.stringify(postings, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

    return this.ds.transaction('SERIALIZABLE', async (m) => {
      const prior = await m.query('SELECT request_hash, response FROM idempotency_keys WHERE key = $1', [idempotencyKey]);
      if (prior.length) {
        if (prior[0].request_hash !== requestHash) throw new ConflictException('Idempotency-Key reused with different payload');
        return prior[0].response;
      }

      await m.query('SELECT pg_advisory_xact_lock($1)', [LEDGER_LOCK]);
      const last = await m.query('SELECT hash FROM ledger_entries ORDER BY seq DESC LIMIT 1');
      let prev: string = last[0]?.hash ?? GENESIS;

      const txId = randomUUID();
      const createdAt = new Date().toISOString();
      for (const p of postings) {
        await this.applyBalance(m, p);
        const hash = entryHash(prev, txId, p, createdAt);
        await m.query(
          `INSERT INTO ledger_entries (tx_id, account_id, asset, amount, created_at, prev_hash, hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [txId, p.accountId, p.asset, p.amount.toString(), createdAt, prev, hash],
        );
        prev = hash;
      }

      const response = { txId, hash: prev };
      await m.query('INSERT INTO idempotency_keys (key, request_hash, response) VALUES ($1,$2,$3)', [idempotencyKey, requestHash, response]);
      await m.query('INSERT INTO outbox (id, topic, payload) VALUES ($1,$2,$3)', [randomUUID(), 'payment.posted', { txId, hash: prev }]);
      return response;
    });
  }

  /** Seals unsealed entries into a signed block (run by a scheduler). */
  async sealBlock(): Promise<number | null> {
    return this.ds.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock($1)', [LEDGER_LOCK]);
      const rows = await m.query('SELECT seq, hash FROM ledger_entries WHERE block_no IS NULL ORDER BY seq');
      if (!rows.length) return null;

      const lastBlock = await m.query('SELECT block_no, block_hash FROM ledger_blocks ORDER BY block_no DESC LIMIT 1');
      const blockNo = Number(lastBlock[0]?.block_no ?? 0) + 1;
      const prevBlockHash = lastBlock[0]?.block_hash ?? GENESIS;
      const root = merkleRoot(rows.map((r: any) => r.hash));
      const lastSeq = rows[rows.length - 1].seq;
      const blockHash = sha256([prevBlockHash, root, lastSeq].join('|'));
      const signature = await this.signer.sign(blockHash);

      await m.query(
        `INSERT INTO ledger_blocks (block_no, first_seq, last_seq, merkle_root, prev_block_hash, block_hash, signature)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [blockNo, rows[0].seq, lastSeq, root, prevBlockHash, blockHash, signature],
      );
      await m.query('UPDATE ledger_entries SET block_no = $1 WHERE seq BETWEEN $2 AND $3', [blockNo, rows[0].seq, lastSeq]);
      await m.query('INSERT INTO outbox (id, topic, payload) VALUES ($1,$2,$3)', [randomUUID(), 'ledger.block_sealed', { blockNo, blockHash }]);
      return blockNo;
    });
  }

  /** Recomputes every hash; returns the first broken seq or null if the chain is intact. */
  async verifyChain(): Promise<number | null> {
    const rows = await this.ds.query(
      'SELECT seq, tx_id, account_id, asset, amount, created_at, prev_hash, hash FROM ledger_entries ORDER BY seq',
    );
    let prev = GENESIS;
    for (const r of rows) {
      const createdAt = new Date(r.created_at).toISOString();
      const expected = entryHash(prev, r.tx_id, { accountId: r.account_id, asset: r.asset, amount: BigInt(r.amount) }, createdAt);
      if (r.prev_hash !== prev || r.hash !== expected) return Number(r.seq);
      prev = r.hash;
    }
    return null;
  }

  private assertBalanced(postings: Posting[]): void {
    if (postings.length < 2) throw new BadRequestException('A transaction needs at least two postings');
    const sums = new Map<string, bigint>();
    for (const p of postings) sums.set(p.asset, (sums.get(p.asset) ?? 0n) + p.amount);
    for (const [asset, sum] of sums) {
      if (sum !== 0n) throw new BadRequestException(`Postings for ${asset} are not balanced`);
    }
  }

  private async applyBalance(m: EntityManager, p: Posting): Promise<void> {
    const rows = await m.query('SELECT amount FROM balances WHERE account_id = $1 FOR UPDATE', [p.accountId]);
    if (!rows.length) throw new BadRequestException(`Unknown account ${p.accountId}`);
    // CHECK (allow_negative OR amount >= 0) rejects overdrafts on user accounts.
    await m.query('UPDATE balances SET amount = amount + $1 WHERE account_id = $2', [p.amount.toString(), p.accountId]);
  }
}
