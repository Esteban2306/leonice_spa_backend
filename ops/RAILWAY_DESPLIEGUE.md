# Despliegue del backend en Railway

Dominios: frontend `https://leonicespa.com` y `https://www.leonicespa.com`; API `https://api.leonicespa.com`.

## 1. Servicios en Railway

1. **PostgreSQL** (plugin de Railway).
2. **Redis** (plugin de Railway). BullMQ necesita `maxmemory-policy noeviction`; verifícalo en la configuración del Redis.
3. **API**: servicio desde este repositorio. `railway.json` ya indica el `dockerfile`, el healthcheck `/api/v1/health` y el comando previo `prisma migrate deploy`, que se ejecuta en cada despliegue antes de arrancar.

Rama a desplegar: la que tenga el sistema más reciente (hoy `feat/whatsapp-operations`, que va por delante de `main`). Decide si se hace merge a `main` y se despliega desde ahí.

## 2. Variables del servicio API

| Variable                                                                                                           | Valor                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                         | `production`                                                                                                                     |
| `PORT`                                                                                                             | `3000`                                                                                                                           |
| `DATABASE_URL`                                                                                                     | referencia al plugin: `${{Postgres.DATABASE_URL}}`                                                                               |
| `REDIS_URL`                                                                                                        | referencia al plugin: `${{Redis.REDIS_URL}}`                                                                                     |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`                                                                                 | `openssl rand -hex 32`, distintos entre sí                                                                                       |
| `ENCRYPTION_KEY`                                                                                                   | `openssl rand -hex 32` (64 caracteres hexadecimales)                                                                             |
| `CANCELLATION_LINK_SECRET`                                                                                         | `openssl rand -hex 32`                                                                                                           |
| `CORS_ORIGIN`                                                                                                      | `https://leonicespa.com,https://www.leonicespa.com` (el primero debe ser el sitio público: de ahí sale el enlace de cancelación) |
| `FRONTEND_ADMIN_URL`                                                                                               | `https://leonicespa.com/admin`                                                                                                   |
| `SPA_PUBLIC_URL`                                                                                                   | `https://api.leonicespa.com`                                                                                                     |
| `CLIENT_CANCELLATION_URL`                                                                                          | `https://leonicespa.com/cancelar`                                                                                                |
| `TRUST_PROXY_HOPS`                                                                                                 | `1` con DNS only; `2` si `api` va con proxy de Cloudflare                                                                        |
| `THROTTLE_LIMIT`                                                                                                   | `100`                                                                                                                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                         | de la consola de Google                                                                                                          |
| `GOOGLE_CALLBACK_URL`                                                                                              | `https://api.leonicespa.com/api/v1/auth/google/callback`                                                                         |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                             | de Cloudinary                                                                                                                    |
| `CONDUIT_BASE_URL`                                                                                                 | `https://…` (obligatoria, no puede ser localhost)                                                                                |
| `CONDUIT_API_KEY`, `CONDUIT_TOOL_API_KEY`, `CONDUIT_WEBHOOK_SECRET`                                                | obligatorias en producción                                                                                                       |
| `CONDUIT_WHATSAPP_CONNECTION_ID`, `CONDUIT_INTEGRATION_ID`, `CONDUIT_INTEGRATION_SECRET`, `CONDUIT_DEFAULT_BOT_ID` | de Conduit                                                                                                                       |
| `CONDUIT_TEMPLATE_*`                                                                                               | los ids de plantilla que correspondan en el Conduit de producción                                                                |
| `SIIGO_ENABLED`                                                                                                    | `false` hasta tener credenciales                                                                                                 |

La API no arranca en producción si falta alguna de las obligatorias o si `CORS_ORIGIN` o `CONDUIT_BASE_URL` no son válidos: el error aparece en los logs de Railway.

## 3. Migrar los datos reales (productos, tratamientos, ajustes)

Los datos de prueba (reservas, clientes, usuarios QA, promociones) ya se borraron de la base de desarrollo. Lo que se conserva y viaja a producción: categorías, capacity pools, tratamientos y sus pasos, productos con presentaciones e imágenes, etiquetas, recomendaciones, horario de atención y ajustes del negocio. Las imágenes viven en Cloudinary; la base solo guarda sus URLs.

1. **Exportar** desde la base de desarrollo (el archivo no se sube a git):

```bash
docker exec leonice-postgres pg_dump -U <usuario> -d leonice_spa --format=custom --data-only \
  -t categories -t capacity_pools -t treatments -t treatment_steps \
  -t treatment_hair_length_pricing -t treatment_hair_color_surcharge \
  -t product_categories -t products -t product_variants -t product_tags \
  -t product_tag_assignments -t treatment_product_recommendations \
  -t operating_windows -t business_settings > datos_reales.dump
```

2. **Crear el esquema** en Railway: se aplica solo con el primer despliegue (`prisma migrate deploy`). Para hacerlo antes de restaurar, ejecútalo a mano con la URL pública de la base:

```bash
DATABASE_URL="<url pública de Railway>" pnpm prisma migrate deploy
```

3. **Restaurar.** Las migraciones ya insertan el horario y los ajustes por defecto, así que primero se vacían esas dos tablas:

```bash
psql "<url pública de Railway>" -c "truncate operating_windows, business_settings"
pg_restore --data-only --disable-triggers --exit-on-error -d "<url pública de Railway>" datos_reales.dump
```

Este procedimiento se ensayó en una base nueva: 130 productos, 125 imágenes, 21 tratamientos, 95 pasos, 17 etiquetas y 221 asignaciones quedaron completos.

4. **Crear el administrador y las plantillas de Conduit** (idempotente: no sobrescribe lo que ya existe):

```bash
DATABASE_URL="<url pública de Railway>" NODE_ENV=production \
SEED_ADMIN_PASSWORD="<contraseña fuerte de 14+ caracteres>" \
CONDUIT_BASE_URL=… CONDUIT_API_KEY=… pnpm prisma db seed
```

No ejecutes `seed:product-catalog` en producción: borra los productos que no estén en el catálogo del seed.

La caché de productos y tratamientos expira sola en 5 minutos.

## 4. Verificación posterior

- `https://api.leonicespa.com/api/v1/health` responde 200 con base de datos y Redis en `true`.
- Entrar a `https://leonicespa.com/admin` con el administrador del seed.
- Catálogo público con productos e imágenes; reservar una cita de prueba, cancelarla desde el enlace y borrarla.
- Registrar en Conduit el webhook `https://api.leonicespa.com/api/v1/integrations/conduit/message-events`.
- En la consola de Google: origen `https://leonicespa.com` y la URI de redirección anterior.

## 5. Promociones

No hay pantalla de promociones en el panel: se crean con la API, con sesión de administrador (`POST /api/v1/promotions`). Cada promoción apunta a **un** tratamiento o a **una** categoría, nunca a ambos.
