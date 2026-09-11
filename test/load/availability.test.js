import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // 20 usuarios en 30s
    { duration: '1m', target: 50 }, // 50 usuarios en 1m
    { duration: '30s', target: 100 }, // 100 usuarios en 30s
    { duration: '30s', target: 0 }, // Ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = 'http://localhost:3920';
const TREATMENT_ID = '24336901-5493-46d5-8c22-07bdb4898254';
const DATE = '2026-09-15';

export default function () {
  const res = http.get(
    `${BASE_URL}/api/v1/reservations/availability?treatmentId=${TREATMENT_ID}&date=${DATE}`,
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has treatmentId': (r) => r.json().treatmentId === TREATMENT_ID,
    'has date': (r) => r.json().date === DATE,
    'has slots array': (r) => Array.isArray(r.json().slots),
    'slots is not empty': (r) => r.json().slots && r.json().slots.length > 0,
    'slots have iso and localTime': (r) => {
      const slots = r.json().slots;
      return slots && slots.every((s) => s.iso && s.localTime);
    },
  });
  sleep(1);
}
