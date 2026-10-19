import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, READ_PARAMS, isoDate, pickTreatments } from './common.js';

export const options = {
  scenarios: {
    lectura_publica: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 25 },
        { duration: '40s', target: 100 },
        { duration: '20s', target: 150 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:catalogo}': ['p(95)<250'],
    'http_req_duration{kind:disponibilidad}': ['p(95)<400'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  return { treatments: pickTreatments() };
}

export default function (data) {
  const treatment = data.treatments[__ITER % data.treatments.length];

  const catalog = http.get(`${API}/treatments`, { ...READ_PARAMS, tags: { kind: 'catalogo' } });
  check(catalog, { 'catálogo 200': (r) => r.status === 200 });

  const showcase = http.get(`${API}/showcase/categories`, {
    ...READ_PARAMS,
    tags: { kind: 'catalogo' },
  });
  check(showcase, { 'vitrina 200': (r) => r.status === 200 });

  const slots = http.get(
    `${API}/reservations/availability?treatmentId=${treatment.id}&date=${isoDate(3 + (__ITER % 40))}`,
    { ...READ_PARAMS, tags: { kind: 'disponibilidad' } },
  );
  check(slots, {
    'disponibilidad 200': (r) => r.status === 200,
    'trae slots': (r) => Array.isArray(r.json().slots),
  });

  const hours = http.get(`${API}/business-hours`, READ_PARAMS);
  const stories = http.get(`${API}/testimonials`, READ_PARAMS);
  check(hours, { 'horario 200': (r) => r.status === 200 });
  check(stories, { 'testimonios 200': (r) => r.status === 200 });

  sleep(0.3);
}
