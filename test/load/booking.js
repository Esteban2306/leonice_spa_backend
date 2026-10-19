import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import {
  API,
  JSON_HEADERS,
  bogotaIso,
  bookingBody,
  pickTreatments,
  uniquePhone,
} from './common.js';

const created = new Counter('reservas_creadas');
const rejected = new Counter('reservas_rechazadas_por_regla');
const serverErrors = new Counter('errores_5xx');

export const options = {
  scenarios: {
    reservas: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 60,
      maxVUs: 150,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '40s', target: 25 },
        { duration: '20s', target: 40 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    errores_5xx: ['count==0'],
    'http_req_duration{kind:reserva}': ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  return { treatments: pickTreatments() };
}

export default function (data) {
  const treatment = data.treatments[(__VU + __ITER) % data.treatments.length];
  const day = 2 + ((__VU * 7 + __ITER) % 80);
  const hour = 8 + ((__ITER + __VU) % 8);
  const res = http.post(
    `${API}/reservations`,
    bookingBody(uniquePhone(), treatment.id, bogotaIso(day, hour)),
    { ...JSON_HEADERS, tags: { kind: 'reserva' } },
  );

  if (res.status >= 500) serverErrors.add(1);
  if (res.status === 201) created.add(1);
  else if (res.status >= 400 && res.status < 500) rejected.add(1);

  check(res, {
    'sin errores de servidor': (r) => r.status < 500,
    'respuesta esperada (201 o regla de negocio)': (r) =>
      r.status === 201 || [400, 409, 422].includes(r.status),
  });
  sleep(0.2);
}
