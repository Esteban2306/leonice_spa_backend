import http from 'k6/http';
import { check, sleep } from 'k6';
import { API } from './common.js';

export const options = {
  scenarios: {
    panel: { executor: 'constant-vus', vus: 15, duration: '60s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<600'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({
      email: __ENV.ADMIN_EMAIL,
      password: __ENV.ADMIN_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Login falló: ${res.status}`);
  }
  return { cookies: http.cookieJar().cookiesForURL(`${API}/`) };
}

export default function (data) {
  const jar = http.cookieJar();
  for (const [name, values] of Object.entries(data.cookies)) {
    jar.set(API, name, values[0]);
  }
  const paths = [
    '/admin/dashboard/summary',
    '/reservations?pageSize=20',
    '/clients?q=Carga',
    '/deposits?status=PENDIENTE',
  ];
  for (const path of paths) {
    const res = http.get(`${API}${path}`);
    check(res, { [`${path} 200`]: (r) => r.status === 200 });
  }
  sleep(0.5);
}
