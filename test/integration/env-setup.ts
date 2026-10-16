import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const AUDIT_DB = 'leonice_audit';
const base = process.env.AUDIT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const url = new URL(base);
url.pathname = `/${AUDIT_DB}`;
url.searchParams.set('connection_limit', process.env.AUDIT_POOL ?? '30');

process.env.DATABASE_URL = url.toString();
process.env.TZ = 'America/Bogota';

Reflect.set(http, 'globalAgent', new http.Agent({ keepAlive: false }));
Reflect.set(https, 'globalAgent', new https.Agent({ keepAlive: false }));
