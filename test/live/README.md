# Verificación en vivo (Postgres + Redis reales)

Pruebas de integración manuales contra la infraestructura de desarrollo. **No** forman parte de `jest`.

## Seguridad

- El backend de prueba se arranca con `CONDUIT_BASE_URL` apuntando a `conduit-sink.js` (`:4199`): ningún WhatsApp ni evento llega a Conduit; todo queda en `sink.jsonl`.
- Clientes sintéticos con prefijo `+999` (no existe como país).
- Ninguna otra instancia del backend debe estar conectada al mismo Redis: competiría por los jobs (y la tuya sí apunta a Conduit).
- `phase0.mjs` borra los contadores del throttler en Redis antes de cada petición (solo dev) para aislar la lógica de dominio del rate limit; la sonda `probe` lo deja activo a propósito.

## Pasos

```bash
node --env-file=.env test/live/create-qa-admin.js test/live/.qa-admin.json   # una vez
node test/live/conduit-sink.js test/live/sink.jsonl                          # terminal 1
PORT=3921 CONDUIT_BASE_URL=http://localhost:4199 TZ=America/Bogota \
  CONDUIT_TEMPLATE_ADMIN_DEPOSIT_TIMEOUT=qa-admin-deposit-timeout \
  CONDUIT_TEMPLATE_ADMIN_RESCHEDULED=qa-admin-rescheduled \
  CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED=qa-client-rejected \
  CONDUIT_TEMPLATE_CLIENT_DEPOSIT_REJECTED_NO_DEADLINE=qa-client-rejected-no-deadline \
  CONDUIT_TEMPLATE_CLIENT_RESCHEDULED=qa-client-rescheduled \
  npx nest start                                                            # terminal 2
node test/live/phase0.mjs                     # todos (revive tarda ≤ 6 min por el barrido real)
node test/live/phase0.mjs approve credit      # escenarios sueltos
node test/live/cleanup.mjs                    # cancela (soft) las reservas sintéticas vivas
```

## Escenarios

| Id              | Qué prueba                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| probe           | Forma del cuerpo de error y rate limit del admin                            |
| create (S1)     | Nace `PENDIENTE_DEPOSITO` con `depositExpiresAt`                            |
| approve (S2)    | `amount` requerido / mínimo, ANTICIPO por defecto = 20                      |
| scope (S3)      | `SINGLE` vs `GROUP`                                                         |
| reschedule (S4) | Reagendar en sitio, códigos `SAME_SLOT` / `OUTSIDE_OPERATING_HOURS`, avisos |
| proofGuard (S6) | Job `deposito-timeout` no cancela con comprobante pendiente                 |
| credit (S7)     | Crédito disponible → aplicado → aprobar sin depósito → liberado             |
| revive (S5)     | Barrido real cancela por `TIMEOUT` → revivir → códigos `NOT_REVIVABLE`      |
