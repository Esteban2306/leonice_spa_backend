import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import {
  REDIS_OUTAGE_LOG_INTERVAL_MS,
  RedisConnectionReporter,
} from './redis-connection-reporter.service';

const refused = Object.assign(new Error(''), { code: 'ECONNREFUSED' });

describe('RedisConnectionReporter', () => {
  let warn: jest.SpyInstance<void, [message: string]>;
  let log: jest.SpyInstance<void, [message: string]>;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation() as unknown as jest.SpyInstance<
      void,
      [message: string]
    >;
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation() as unknown as jest.SpyInstance<
      void,
      [message: string]
    >;
  });

  afterEach(() => jest.restoreAllMocks());

  it('avisa una sola vez al caer y calla los reintentos siguientes', () => {
    const reporter = new RedisConnectionReporter();
    for (let i = 0; i < 30; i++)
      reporter.reportError('Caché', refused, i * 2_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('ECONNREFUSED');
  });

  it('resume la caída como máximo una vez por intervalo', () => {
    const reporter = new RedisConnectionReporter();
    const step = 2_000;
    const total = (3 * REDIS_OUTAGE_LOG_INTERVAL_MS) / step;
    for (let i = 0; i <= total; i++)
      reporter.reportError('Caché', refused, i * step);

    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[3]?.[0]).toContain('sigue sin conexión');
  });

  it('lleva la cuenta por fuente', () => {
    const reporter = new RedisConnectionReporter();
    reporter.reportError('Caché', refused, 0);
    reporter.reportError('Cola reservation-timeouts', refused, 0);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('al reconectar lo informa y una caída posterior vuelve a avisar', () => {
    const reporter = new RedisConnectionReporter();
    const client = new EventEmitter();
    reporter.watchClient(client, 'Caché');

    client.emit('error', refused);
    client.emit('error', refused);
    client.emit('ready');
    client.emit('ready');
    client.emit('error', refused);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('sin señal de reconexión, un error tras un intervalo de silencio se trata como caída nueva', () => {
    const reporter = new RedisConnectionReporter();
    reporter.reportError('Worker x', refused, 0);
    reporter.reportError('Worker x', refused, REDIS_OUTAGE_LOG_INTERVAL_MS + 1);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toContain('sin conexión a Redis');
  });
});
