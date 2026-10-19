import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const E2E_DB = 'leonice_e2e';
const base = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const url = new URL(base);
url.pathname = `/${E2E_DB}`;
url.searchParams.set('connection_limit', process.env.E2E_POOL ?? '30');
process.env.DATABASE_URL = url.toString();

const redisUrl = process.env.E2E_REDIS_URL;
if (!redisUrl) {
  throw new Error(
    'Las pruebas e2e exigen E2E_REDIS_URL (un Redis propio, nunca el de desarrollo). Ej.: docker run -d -p 127.0.0.1:6390:6379 redis:8-alpine y E2E_REDIS_URL=redis://localhost:6390',
  );
}
process.env.REDIS_URL = redisUrl;

const sinkPort = process.env.E2E_SINK_PORT ?? '4799';
process.env.CONDUIT_BASE_URL = `http://127.0.0.1:${sinkPort}`;
process.env.CONDUIT_API_KEY = 'e2e-conduit-key';
process.env.CONDUIT_WHATSAPP_CONNECTION_ID = 'e2e-connection';
process.env.CONDUIT_INTEGRATION_ID = 'e2e-integration';
process.env.CONDUIT_INTEGRATION_SECRET = 'e2e-integration-secret';
process.env.CONDUIT_DEFAULT_BOT_ID = 'e2e-bot';

process.env.TZ = 'America/Bogota';
process.env.NODE_ENV = 'test';
process.env.THROTTLE_LIMIT_DEFAULT ??= '100000';
process.env.THROTTLE_LIMIT_AVAILABILITY ??= '100000';
process.env.THROTTLE_LIMIT_RESERVATIONS ??= '100000';
process.env.THROTTLE_LIMIT_WEBHOOKS ??= '100000';

Reflect.set(http, 'globalAgent', new http.Agent({ keepAlive: false }));
Reflect.set(https, 'globalAgent', new https.Agent({ keepAlive: false }));
