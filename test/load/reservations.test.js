import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
  stages: [
    { duration: '1m', target: 10 }, // 10 usuarios en 1m
    { duration: '2m', target: 20 }, // 20 usuarios en 2m
    { duration: '1m', target: 0 }, // Ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = 'http://localhost:3920';
const CLIENT_IDS = new SharedArray('client ids', function () {
  return Array.from({ length: 100 }, (_, i) => `client-${i + 1}`);
});

export default function () {
  const clientId = CLIENT_IDS[Math.floor(Math.random() * CLIENT_IDS.length)];
  const treatmentId = '24336901-5493-46d5-8c22-07bdb4898254';
  const startDate = new Date(
    Date.now() + 86400000 * (1 + Math.floor(Math.random() * 7)),
  ).toISOString();

  const res = http.post(
    `${BASE_URL}/api/v1/reservations`,
    JSON.stringify({
      clientId,
      treatmentId,
      scheduledStart: startDate,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  check(res, {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
    'response has id': (r) => r.json().id !== undefined,
    'response has clientId': (r) => r.json().clientId === clientId,
  });
  sleep(2);
}
