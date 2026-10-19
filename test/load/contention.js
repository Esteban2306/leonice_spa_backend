import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import {
  API,
  JSON_HEADERS,
  bogotaIso,
  bookingBody,
  pickTreatments,
  uniquePhone,
} from './common.js';

const accepted = new Counter('aceptadas_mismo_horario');
const serverErrors = new Counter('errores_5xx');

export const options = {
  scenarios: {
    mismo_horario: {
      executor: 'per-vu-iterations',
      vus: 60,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: { errores_5xx: ['count==0'] },
};

export function setup() {
  return { treatment: pickTreatments()[0] };
}

export default function (data) {
  const res = http.post(
    `${API}/reservations`,
    bookingBody(uniquePhone(), data.treatment.id, bogotaIso(30, 9)),
    JSON_HEADERS,
  );
  if (res.status >= 500) serverErrors.add(1);
  if (res.status === 201) accepted.add(1);
  check(res, { 'sin 5xx': (r) => r.status < 500 });
}
