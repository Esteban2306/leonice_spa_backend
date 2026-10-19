import http from 'k6/http';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3921';
export const API = `${BASE_URL}/api/v1`;

export function pickTreatments() {
  const res = http.get(`${API}/treatments`);
  if (res.status !== 200) {
    throw new Error(`No se pudo leer el catálogo: ${res.status}`);
  }
  const all = res
    .json()
    .filter((t) => t.isActive && !t.requiresPriorAssessment);
  if (all.length === 0) throw new Error('No hay servicios sin valoración previa');
  return all.map((t) => ({ id: t.id, categoryId: t.categoryId }));
}

export function isoDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
}

export function bogotaIso(daysAhead, hour, minute = 0) {
  const base = new Date(Date.now() + daysAhead * 86400000);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-05:00`;
}

export function uniquePhone() {
  const n = `${__VU}${__ITER}${Date.now()}`.slice(-9);
  return `+99900${n}`;
}

export function bookingBody(phone, treatmentId, scheduledStart) {
  return JSON.stringify({
    client: {
      phone,
      name: `Carga ${phone.slice(-6)}`,
      birthDate: '1990-01-01',
      consent: { policyVersion: 'v1', healthDataConsent: true },
    },
    treatments: [treatmentId],
    scheduledStart,
  });
}

const BYPASS = __ENV.THROTTLE_BYPASS_KEY ? { 'x-api-key': __ENV.THROTTLE_BYPASS_KEY } : {};

export const JSON_HEADERS = {
  headers: { 'Content-Type': 'application/json', ...BYPASS },
};

export const READ_PARAMS = { headers: BYPASS };
