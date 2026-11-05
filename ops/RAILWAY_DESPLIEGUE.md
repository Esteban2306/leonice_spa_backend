# Despliegue del backend en Railway

Dominios: sitio público `https://leonicespa.com` y `https://www.leonicespa.com`; panel de administración `https://admin.leonicespa.com`; API `https://api.leonicespa.com`.

## 1. Servicios en Railway

1. **PostgreSQL** (plugin de Railway).
2. **Redis** (plugin de Railway). BullMQ necesita `maxmemory-policy noeviction`; verifícalo en la configuración del Redis.
3. **API**: servicio desde este repositorio. `railway.json` ya indica el `Dockerfile`, el healthcheck `/api/v1/health` y el comando previo `prisma migrate deploy`, que se ejecuta en cada despliegue antes de arrancar.

Rama a desplegar: `main`, que ya incluye todo el trabajo de operaciones, campañas y mensajes automáticos.

Si el servicio muestra «The Dockerfile failed validation»: Railway no acepta `RUN --mount=type=cache` sin un prefijo propio, así que el Dockerfile ya no lo usa. En los servicios que se construyen desde una subcarpeta (Conduit: `messaging-service`) hay que indicarlo en Settings → Source → Root Directory.

## 2. Variables del servicio API

| Variable                                                                                                           | Valor                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                                         | `production`                                                                                                                                                  |
| `PORT`                                                                                                             | `3000`                                                                                                                                                        |
| `DATABASE_URL`                                                                                                     | referencia al plugin: `${{Postgres.DATABASE_URL}}`                                                                                                            |
| `REDIS_URL`                                                                                                        | referencia al plugin: `${{Redis.REDIS_URL}}`                                                                                                                  |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`                                                                                 | `openssl rand -hex 32`, distintos entre sí                                                                                                                    |
| `ENCRYPTION_KEY`                                                                                                   | `openssl rand -hex 32` (64 caracteres hexadecimales)                                                                                                          |
| `CANCELLATION_LINK_SECRET`                                                                                         | `openssl rand -hex 32`                                                                                                                                        |
| `CORS_ORIGIN`                                                                                                      | `https://leonicespa.com,https://www.leonicespa.com,https://admin.leonicespa.com` (el primero debe ser el sitio público: de ahí sale el enlace de cancelación) |
| `COOKIE_DOMAIN`                                                                                                    | `.leonicespa.com` (con punto inicial; obligatoria en producción, ver nota)                                                                                    |
| `FRONTEND_ADMIN_URL`                                                                                               | `https://admin.leonicespa.com/admin`                                                                                                                          |
| `SPA_PUBLIC_URL`                                                                                                   | `https://api.leonicespa.com`                                                                                                                                  |
| `CLIENT_CANCELLATION_URL`                                                                                          | `https://leonicespa.com/cancelar`                                                                                                                             |
| `TRUST_PROXY_HOPS`                                                                                                 | `1` con DNS only; `2` si `api` va con proxy de Cloudflare                                                                                                     |
| `THROTTLE_LIMIT`                                                                                                   | `100`                                                                                                                                                         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                         | de la consola de Google                                                                                                                                       |
| `GOOGLE_CALLBACK_URL`                                                                                              | `https://api.leonicespa.com/api/v1/auth/google/callback`                                                                                                      |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                             | de Cloudinary                                                                                                                                                 |
| `CONDUIT_BASE_URL`                                                                                                 | `https://…` (obligatoria, no puede ser localhost)                                                                                                             |
| `CONDUIT_API_KEY`, `CONDUIT_TOOL_API_KEY`, `CONDUIT_WEBHOOK_SECRET`                                                | obligatorias en producción                                                                                                                                    |
| `CONDUIT_WHATSAPP_CONNECTION_ID`, `CONDUIT_INTEGRATION_ID`, `CONDUIT_INTEGRATION_SECRET`, `CONDUIT_DEFAULT_BOT_ID` | de Conduit                                                                                                                                                    |
| `CONDUIT_TEMPLATE_*`                                                                                               | los ids de plantilla que correspondan en el Conduit de producción                                                                                             |
| `SIIGO_ENABLED`                                                                                                    | `false` hasta tener credenciales                                                                                                                              |

La API no arranca en producción si falta alguna de las obligatorias o si `CORS_ORIGIN`, `COOKIE_DOMAIN` o `CONDUIT_BASE_URL` no son válidos: el error aparece en los logs de Railway.

**Por qué `COOKIE_DOMAIN`.** El inicio de sesión guarda las cookies de acceso solo para `api.leonicespa.com`, pero el token CSRF debe poder leerlo el JavaScript del panel y del sitio, que viven en otros subdominios. Con `COOKIE_DOMAIN=.leonicespa.com` esa cookie se comparte entre `admin.`, `www.` y `api.`; sin ella el panel entra, pero todas las acciones que modifican datos fallan con `CSRF_INVALID`. Las cookies de sesión siguen siendo solo de la API (`HttpOnly`, `Secure`, `SameSite=Lax`) y, al ser el mismo sitio registrable, el navegador las envía en las peticiones del panel. La API valida al arrancar que todos los orígenes de `CORS_ORIGIN` pertenezcan a ese dominio.

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
SEED_ADMIN_PASSWORD="<contraseña de 8+ caracteres>" \
CONDUIT_BASE_URL=… CONDUIT_API_KEY=… pnpm prisma db seed
```

No ejecutes `seed:product-catalog` en producción: borra los productos que no estén en el catálogo del seed.

La caché de productos y tratamientos expira sola en 5 minutos.

## 4. Verificación posterior

- `https://api.leonicespa.com/api/v1/health` responde 200 con base de datos y Redis en `true`.
- Entrar a `https://admin.leonicespa.com/admin` con el administrador del seed y hacer una acción que modifique datos (por ejemplo, editar una nota): confirma que la cookie `csrf_token` aparece en el dominio `.leonicespa.com` y que no hay errores `CSRF_INVALID`.
- Desde `https://leonicespa.com` y `https://www.leonicespa.com` el catálogo carga sin errores de CORS.
- Catálogo público con productos e imágenes; reservar una cita de prueba, cancelarla desde el enlace y borrarla.
- Registrar en Conduit el webhook `https://api.leonicespa.com/api/v1/integrations/conduit/message-events`.
- En la consola de Google: orígenes `https://admin.leonicespa.com` y `https://leonicespa.com`, y la URI de redirección anterior.

## 5. Promociones y campañas

Las promociones se crean en el panel (`/admin/promotions`). Cada una apunta a **un** tratamiento o a **una** categoría, nunca a ambos.

Las campañas de WhatsApp (`/admin/campaigns`) usan plantillas que deben existir en Conduit: el seed del paso 3.4 las crea todas (operativas y de difusión). Si añades plantillas nuevas al catálogo, vuelve a ejecutar `pnpm prisma db seed` con `CONDUIT_BASE_URL` y `CONDUIT_API_KEY`; no sobrescribe las que ya existen salvo que pongas `CONDUIT_TEMPLATES_OVERWRITE=true`.

## 6. Panel en `admin.leonicespa.com` (Cloudflare)

El panel y el sitio público son el mismo Worker; el subdominio solo cambia la dirección de entrada. En Cloudflare, sección Rules:

1. **Rewrite URL** — si el host es `admin.leonicespa.com` y la ruta es exactamente `/`, reescribir a `/admin` (así `https://admin.leonicespa.com` abre el panel).
2. **Redirect Rule** — si el host es `leonicespa.com` o `www.leonicespa.com` y la ruta empieza por `/admin`, redirigir (301) a `https://admin.leonicespa.com` conservando la ruta (el panel deja de ser accesible desde el sitio público).
3. Opcional: **Cloudflare Access** sobre `admin.leonicespa.com` (Zero Trust → Access → Applications) para pedir un acceso extra antes de llegar al inicio de sesión. La API (`api.`) queda fuera de Access.

## 7. Orden del despliegue completo

1. **Railway**: crear Postgres y Redis, cargar las variables de la sección 2 y desplegar la API. Comprobar `https://api.leonicespa.com/api/v1/health`.
2. **Cloudflare DNS**: registro `api` apuntando al destino que da Railway (con el valor de `TRUST_PROXY_HOPS` que corresponda).
3. **Datos y seed** (sección 3): migrar productos y tratamientos, crear el administrador y las plantillas de Conduit.
4. **Frontend**: construir y desplegar el Worker **después** de que la API responda. El build prerenderiza páginas del catálogo (`/tratamientos`, productos) llamando a la API; si `api.leonicespa.com` no resuelve, `next build` falla. Variables de build del frontend:

| Variable                      | Valor                                  |
| ----------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_API_URL`         | `https://api.leonicespa.com/api/v1`    |
| `NEXT_PUBLIC_SITE_URL`        | `https://leonicespa.com`               |
| `NEXT_PUBLIC_SPA_WHATSAPP`    | número del spa con indicativo, sin `+` |
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | `false`                                |

`NEXT_PUBLIC_*` se incrustan al construir: cambiarlas exige volver a desplegar. 5. **Cloudflare Rules** (sección 6) y verificación posterior (sección 4). 6. Registrar el webhook en Conduit y revisar en `/admin/campaigns` que las plantillas de difusión aparezcan como creadas.

## 8. Lista de comprobación antes de publicar

- [ ] `main` publicado en GitHub en los dos repositorios.
- [ ] Variables de la sección 2 cargadas en Railway, incluidas `CORS_ORIGIN` con los tres orígenes y `COOKIE_DOMAIN=.leonicespa.com`.
- [ ] Redis de Railway con `maxmemory-policy noeviction`.
- [ ] Primer despliegue verde: `prisma migrate deploy` aplica las 48 migraciones y `/api/v1/health` responde 200.
- [ ] Datos reales restaurados (sección 3) y seed ejecutado: crea el administrador y las 33 plantillas de Conduit.
- [ ] Registro DNS `api` creado en Cloudflare con el destino que da Railway.
- [ ] Frontend construido con las variables de la sección 7 y desplegado después de que la API responda.
- [ ] Reglas de Cloudflare de la sección 6.
- [ ] Webhook de Conduit y orígenes de Google actualizados.
- [ ] Prueba final: iniciar sesión en `admin.leonicespa.com`, editar algo, crear una promoción y revisar `/admin/campaigns/new` con las plantillas en estado «creada».

Antes del primer envío real de una campaña: confirmar en Conduit el nivel de calentamiento del número y la política `INBOUND_ONLY`, y ajustar en «Ajustes de envío» las franjas según la hora pico del asistente.
