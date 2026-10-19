# Pruebas

| Capa                                                                             | Comando                           | Qué usa                                                 |
| -------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Unitarias (reglas puras: disponibilidad, precios, depósitos, créditos, estados)  | `pnpm test`                       | Nada externo                                            |
| Integración (reglas, concurrencia, seguridad y privacidad sobre PostgreSQL real) | `pnpm test:integration`           | Base `leonice_audit`; Redis y colas simulados           |
| E2E (HTTP completo, PostgreSQL y Redis reales, workers BullMQ)                   | `pnpm test:e2e`                   | Base `leonice_e2e` y un Redis propio en `E2E_REDIS_URL` |
| Carga                                                                            | `k6 run test/load/<escenario>.js` | Una instancia aislada de la API                         |

## Seguridad del entorno

- Las pruebas fuerzan el nombre de la base (`leonice_audit` / `leonice_e2e`): nunca tocan la de desarrollo.
- El e2e exige `E2E_REDIS_URL`; jamás reutiliza el Redis de desarrollo (competiría por los jobs).
- Conduit se reemplaza por un sumidero local (`test/e2e/support/conduit-sink.ts`) y el arranque aborta si la configuración apunta a otro host. Cloudinary es un doble en memoria.

## E2E local

```bash
docker run -d --name leonice-qa-redis -p 127.0.0.1:6390:6379 redis:8-alpine
createdb leonice_e2e && DATABASE_URL=<url a leonice_e2e> pnpm exec prisma migrate deploy
E2E_REDIS_URL=redis://localhost:6390 pnpm test:e2e
```

## Carga

Levanta la API contra una base y un Redis propios (puerto distinto del de desarrollo) con `CONDUIT_TOOL_API_KEY` definida, y pásala como `THROTTLE_BYPASS_KEY` para que el límite por IP no tape la capacidad real:

```bash
THROTTLE_BYPASS_KEY=<clave> BASE_URL=http://localhost:3921 k6 run test/load/read-mix.js
THROTTLE_BYPASS_KEY=<clave> k6 run test/load/booking.js
THROTTLE_BYPASS_KEY=<clave> k6 run test/load/contention.js
ADMIN_EMAIL=<correo> ADMIN_PASSWORD=<clave> k6 run test/load/admin.js
```

Los umbrales de cada script (p95, errores, cero 5xx) hacen fallar la ejecución si el sistema se degrada.
