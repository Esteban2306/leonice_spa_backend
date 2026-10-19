import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface SinkRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown> | null;
  status: number;
}

export class ConduitSink {
  readonly requests: SinkRequest[] = [];
  private failures: { remaining: number; status: number } | null = null;
  private server: http.Server | null = null;
  port = 0;

  async start(port = Number(process.env.E2E_SINK_PORT ?? 4799)): Promise<void> {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        let body: Record<string, unknown> | null = null;
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        } catch {
          body = null;
        }
        const failing = this.failures !== null && this.failures.remaining > 0;
        this.requests.push({
          method: req.method ?? 'GET',
          url: req.url ?? '',
          headers: req.headers,
          body,
          status: failing ? this.failures!.status : 200,
        });
        if (failing) {
          this.failures!.remaining -= 1;
          res.writeHead(this.failures!.status, {
            'content-type': 'application/json',
          });
          res.end(JSON.stringify({ message: 'caído a propósito' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            messageId: `sink-${this.requests.length}`,
            ok: true,
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(port, '127.0.0.1', resolve),
    );
    this.port = (this.server.address() as AddressInfo).port;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  failNext(count: number, status = 503): void {
    this.failures = { remaining: count, status };
  }

  clear(): void {
    this.requests.length = 0;
    this.failures = null;
  }

  messages(): SinkRequest[] {
    return this.requests.filter(
      (r) => r.url.includes('/messages') && r.status === 200,
    );
  }

  async waitFor(
    predicate: (requests: readonly SinkRequest[]) => boolean,
    timeoutMs = 15_000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate(this.requests)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return predicate(this.requests);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }
}
