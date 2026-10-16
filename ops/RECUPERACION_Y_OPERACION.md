# Operación, respaldos y recuperación de Leonice Spa

Documento operativo del backend. Todo lo descrito aquí se probó con un ensayo
real (ver §9). Los archivos de infraestructura viven en `infra/`.

## 1. Objetivos

| Objetivo                                                     | Valor                                                                                                              | Cómo se cumple                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| RPO (datos que se pueden perder) con el servidor intacto     | 0 (la base conserva todo; WAL local)                                                                               | PostgreSQL con `fsync` y WAL en volumen persistente                                   |
| RPO si se pierde el servidor completo                        | ≤ 10 min                                                                                                           | `archive_timeout=300 s` + sincronización del archivo WAL al destino remoto cada 5 min |
| RPO ante un borrado o corrupción lógica (error humano o bug) | Cualquier instante dentro de la retención (recuperación puntual)                                                   | Copia base diaria + archivo WAL continuo                                              |
| RTO (tiempo hasta volver a operar)                           | ≤ 60 min con servidor nuevo, ≤ 15 min en el mismo servidor                                                         | Restauración medida en segundos para este volumen; el resto es aprovisionar           |
| Retención                                                    | Dumps: 48 h todos, 30 días uno por día, 12 meses uno por mes. Copias base: 7. WAL: desde la copia base más antigua | `infra/backup/prune.sh`                                                               |

SLOs de referencia (para el tablero de alertas):

- Disponibilidad de `GET /api/v1/health`: 99,5 % mensual.
- Antigüedad del último dump correcto < 12 h; de la última copia base < 48 h.
- Última verificación de restauración correcta < 14 días.
- `pg_stat_archiver.failed_count` sin crecer.

## 2. Qué protege cada capa

| Dato                                                            | Dónde vive                                           | Protección                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Reservas, clientes, depósitos, consentimientos                  | PostgreSQL (`postgres_data`)                         | WAL archivado + copia base diaria + dump cada 6 h, todo con copia remota |
| Colas (recordatorios, avisos, vencimientos, eventos de Conduit) | Redis (`redis_data`)                                 | AOF `everysec` + snapshot RDB. Una caída abrupta pierde como máximo 1 s  |
| Comprobantes de pago y fotos                                    | Cloudinary                                           | Fuera de este repositorio; definir la política en Cloudinary             |
| Secretos                                                        | `infra/.env.production` y `infra/app.env.production` | Fuera de git; copia en un gestor de secretos                             |

Redis no es la fuente de verdad: los vencimientos de depósito y los no-show tienen
barridos que se reconstruyen desde PostgreSQL. Lo que sí se pierde si Redis se pierde
por completo son los recordatorios de cita ya programados y los avisos pendientes
(ver §6).

## 3. Roles de PostgreSQL (mínimo privilegio)

| Rol                | Uso                                      | Permisos                                                                                                                                       |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres_admin`   | Solo administración local del contenedor | Superusuario. `pg_hba` rechaza su acceso por red                                                                                               |
| `leonice_migrator` | Servicio `migrate` y `seed`              | Dueño de la base y del esquema; ejecuta migraciones                                                                                            |
| `leonice_app`      | La API                                   | `SELECT/INSERT/UPDATE/DELETE` y uso de secuencias. Sin DDL, sin `TRUNCATE`. `statement_timeout=30s`, `idle_in_transaction_session_timeout=60s` |
| `leonice_backup`   | Servicio `backup`                        | Replicación, `pg_read_all_data`, `pg_monitor`                                                                                                  |

Las contraseñas se generan con `openssl rand -hex 32` y viven solo en
`infra/.env.production`.

## 4. Primer despliegue

Requisitos: Docker Compose v2, un proxy inverso con TLS delante de la API y un destino
remoto para copias (S3, Backblaze, Drive… cualquier remoto de rclone).

```bash
cd infra
cp .env.production.example .env.production        # rellenar
cp app.env.production.example app.env.production  # rellenar
# Opcional pero recomendado: configurar el remoto de rclone y apuntar RCLONE_CONFIG_FILE
#   rclone config   ->   BACKUP_REMOTE=offsite:leonice-backups

docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.production --profile seed run --rm seed
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api backup
```

Notas:

- El `seed` crea el administrador con `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
  (en producción exige 14+ caracteres con mayúscula, minúscula, número y símbolo),
  el horario de atención y el catálogo. **No** carga productos de prueba: esos scripts
  se niegan a ejecutarse con `NODE_ENV=production`.
- Tras el seed, inicia sesión y **cambia la contraseña del administrador**.
- La API no publica puertos hacia fuera: escucha en `127.0.0.1:${API_PORT}` para el proxy.
- La estrategia de Google se registra siempre: define `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` y `GOOGLE_CALLBACK_URL` aunque no uses ese inicio de sesión.

### Cada actualización

```bash
git pull && docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate   # aplica solo lo pendiente
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
```

Prisma no genera migraciones de reversa. **Antes de migrar** fuerza un dump
(`docker compose ... exec backup sh /opt/backup/pg-dump.sh`). Si una migración falla a
medias, no la edites: restaura (§5.2) y corrige con una migración nueva.

## 5. Procedimientos de recuperación

Todos los comandos se ejecutan en `infra/` con
`DC="docker compose -f docker-compose.prod.yml --env-file .env.production"`.

### 5.1 Ver el estado de los respaldos

```bash
$DC ps backup                                   # Salud: healthy / unhealthy
$DC exec backup /opt/backup/healthcheck.sh      # motivo si no está sano
$DC logs --tail 100 backup
$DC exec backup sh -c 'for f in /backups/status/*; do echo "$f $(cat $f)"; done'
```

`unhealthy` significa que algo está vencido: dump, copia base, subida remota,
verificación semanal o el archivador de WAL. Conecta esa señal a tu monitoreo
(`docker events`, Uptime Kuma, Prometheus con cAdvisor…).

### 5.2 Recuperación puntual (borraron o corrompieron datos)

Es el procedimiento principal. Recupera la base a un instante anterior al error, en una
instancia aparte, **sin tocar producción**:

```bash
# 1. Elige el instante (hora UTC) justo ANTES del error.
T="2026-10-17 14:25:00+00"

# 2. Prepara la copia base + recupera el WAL hasta T en un directorio nuevo.
$DC exec backup sh /opt/backup/restore-physical.sh /tmp/pitr "$T"

# 3. Arranca la instancia temporal (los parámetros deben ser >= a los del primario).
$DC exec backup pg_ctl -D /tmp/pitr -w -l /tmp/pitr.log \
  -o "-p 5498 -k /tmp -c listen_addresses='' -c max_connections=100 -c max_wal_senders=4 -c archive_mode=off" start

# 4. Comprueba los datos.
$DC exec backup psql -h /tmp -p 5498 -U postgres_admin -d leonice_spa -c "SELECT count(*) FROM reservations"

# 5a. Si solo faltan algunas filas: exporta esas tablas/filas con pg_dump o COPY y cárgalas en producción.
# 5b. Si hay que reemplazar toda la base: detén la API, haz un dump de producción por seguridad,
#     restaura el dump de la instancia temporal en producción (§5.3) y vuelve a levantar la API.
$DC exec backup pg_ctl -D /tmp/pitr -m fast stop
```

Para recuperar al estado más reciente archivado usa `latest` en lugar de la fecha.

### 5.3 Restaurar un dump lógico

```bash
$DC stop api
$DC exec backup sh -c 'ls -1 /backups/dumps/*.dump | tail -3'
$DC exec backup sh -c 'pg_dump --format=custom --no-owner --no-acl -f /backups/dumps/pre-restore.dump'   # red de seguridad
# La restauración la hace el dueño de la base:
$DC exec -e PGPASSWORD="$DB_MIGRATOR_PASSWORD" backup \
  pg_restore -h postgres -U leonice_migrator -d leonice_spa --clean --if-exists --no-owner --exit-on-error /backups/dumps/dump-AAAAMMDD-HHMMSS.dump
$DC up -d api
```

### 5.4 Se perdió el servidor completo

1. Aprovisiona un servidor con Docker y clona el repositorio.
2. Restaura `infra/.env.production`, `infra/app.env.production` y el `rclone.conf` desde
   el gestor de secretos.
3. Trae las copias del destino remoto:
   ```bash
   mkdir -p /srv/restore && rclone copy offsite:leonice-backups/base /srv/restore/base
   rclone copy offsite:leonice-backups/wal /srv/restore/wal
   ```
4. Levanta un PostgreSQL con la misma versión y recupera con
   `BACKUP_DIR=/srv/restore WAL_DIR=/srv/restore/wal sh restore-physical.sh <destino> [fecha]`
   (la imagen `leonice-spa-backup` contiene los scripts), o restaura el último
   `dumps/*.dump` con §5.3 si prefieres la vía lógica.
5. Levanta el resto: `up -d redis api backup`. Los barridos de vencimiento y no-show
   se ponen al día solos; revisa §6 para los avisos.

### 5.5 Se perdió solo el volumen de PostgreSQL

Igual que §5.4, pero las copias locales (`backups`, `wal_archive`) siguen disponibles:
no hace falta ir al destino remoto.

## 6. Redis

- Configuración: contraseña obligatoria, AOF `everysec`, snapshots, `maxmemory` 256 MB,
  política `noeviction` (BullMQ no tolera que Redis descarte claves).
- Caída o reinicio: el AOF recupera todo salvo el último segundo.
- Pérdida total del volumen: se pierden los trabajos retrasados. Qué pasa:
  - Vencimiento de depósito y no-show: los repone el barrido cada 5 minutos.
  - Recordatorios de cita ya programados: **se pierden**. Se reprograman al
    crear/confirmar/reprogramar la cita.
  - Eventos de Conduit pendientes: quedan `PENDING` en `conduit_outbox_events`; reenvíalos
    desde el panel (`/admin/conduit/outbox`).
- Memoria llena: con `noeviction` Redis rechaza escrituras. Sube `REDIS_MAXMEMORY` y reinicia
  solo ese servicio.

## 7. Incidentes

| Severidad | Ejemplo                                                     | Respuesta                                                             |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| SEV1      | API caída, no se puede reservar, pérdida de datos           | Atender de inmediato; avisar a la dueña del negocio; recuperar con §5 |
| SEV2      | Respaldos `unhealthy`, WhatsApp sin enviar, Redis degradado | Atender el mismo día                                                  |
| SEV3      | Advertencias, rendimiento                                   | Revisar en la semana                                                  |

Pasos: 1) estabilizar (`$DC ps`, `$DC logs --tail 200 api`); 2) proteger los datos
(dump antes de tocar nada); 3) recuperar; 4) documentar qué pasó y qué lo evita.
Después de un SEV1 escribe un postmortem sin culpables en este mismo directorio.

## 8. Rotación de secretos

| Secreto                             | Cómo rotar                                                                               | Efecto                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Cambiar y reiniciar `api`                                                                | Cierra todas las sesiones |
| `ENCRYPTION_KEY`                    | **No cambiar sin migrar los datos**: las alergias cifradas dejarían de leerse            | Requiere re-cifrado       |
| `DB_*_PASSWORD`                     | `ALTER ROLE ... PASSWORD` dentro de `postgres`, actualizar `.env.production` y reiniciar | Breve corte               |
| `REDIS_PASSWORD`                    | Cambiar y reiniciar `redis`, `api`                                                       | Breve corte               |
| `CONDUIT_*`                         | Rotar en Conduit y aquí                                                                  | Coordinar con el bot      |
| Cloudinary / Google                 | Rotar en su consola                                                                      | —                         |

## 9. Evidencia de ensayos

Cada ensayo se registra aquí (fecha, quién, resultado). El servicio `backup` repite la
verificación automáticamente cada 7 días y falla la salud del contenedor si no pasa.

| Fecha      | Ensayo                                                                                                                                                                              | Resultado                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-16 | Despliegue desde cero (`postgres` + `migrate` sin red externa + `seed` + `api` + `backup`)                                                                                          | Correcto. La API corre con `leonice_app`, sistema de archivos de solo lectura y sin capacidades                                                               |
| 2026-10-16 | Dump + restauración lógica en instancia aislada, con checksums                                                                                                                      | Correcto (1 s). Mismas filas y mismos checksums                                                                                                               |
| 2026-10-16 | Copia base + WAL y recuperación puntual a un instante antes de un `DELETE`                                                                                                          | Correcto en 2 s: 5 de 5 filas recuperadas, recuperación detenida antes de la transacción del borrado                                                          |
| 2026-10-16 | Recuperación solo desde el destino remoto (sin volúmenes locales)                                                                                                                   | Correcto en 2 s                                                                                                                                               |
| 2026-10-16 | Redis con AOF: `kill -9` del contenedor con un trabajo retrasado de BullMQ                                                                                                          | El trabajo sobrevivió y la API se reconectó sola                                                                                                              |
| 2026-10-16 | Retención de dumps con 18 archivos de 1 h a 375 días                                                                                                                                | 12 conservados según la regla (48 h / diario 30 d / mensual 12 m)                                                                                             |
| 2026-10-16 | Salud del contenedor con dump vencido y con error de verificación                                                                                                                   | Pasa a `unhealthy` con el motivo                                                                                                                              |
| 2026-10-16 | Suite de integración con el rol `leonice_app` (sin DDL, sin `TRUNCATE`): reservas, dinero, concurrencia, estados, transacciones, colas, errores, integridad de datos y autorización | 250 pruebas correctas (226 funcionales + 24 de autorización), ninguna por falta de permisos; la API arrancó y atendió login, auditoría y reservas con ese rol |
| Pendiente  | Ensayo con el destino remoto real y volumen de producción                                                                                                                           | Hacer antes de abrir al público                                                                                                                               |

Hallazgo del primer ensayo: la instancia de recuperación debe arrancar con
`max_connections`, `max_worker_processes`, `max_wal_senders`, `max_prepared_transactions` y
`max_locks_per_transaction` iguales o mayores a los del primario; si no, PostgreSQL aborta
la recuperación. El script de verificación ya lo hace automáticamente.

## 10. Pendientes conocidos

- Configurar el destino remoto real y la política de ciclo de vida de la copia remota
  (borrar dumps/WAL con más de la retención deseada; este stack no borra en remoto).
- Conectar `unhealthy` del servicio `backup` a una alerta que llegue a una persona.
- TLS en el proxy inverso y `trust proxy` en la API (ver informe de seguridad).
- Política de retención de datos personales y supresión a solicitud.
