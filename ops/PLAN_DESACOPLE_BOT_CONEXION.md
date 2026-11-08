# Plan: desacoplar el bot de la conexión de WhatsApp

Estado: propuesta para aprobar. Nada de las fases 1 a 5 está construido. Lo único hecho es la fase 0 (pausa del sistema).

## 1. Problema

Hoy el sistema funciona mientras tres identificadores coincidan: la conexión de WhatsApp, el bot y la empresa (tenant). El backend los recibe como variables de entorno (`CONDUIT_WHATSAPP_CONNECTION_ID`, `CONDUIT_DEFAULT_BOT_ID`, `CONDUIT_TENANT_ID`). Si cualquiera cambia, hay que editar variables y redesplegar, y mientras tanto el panel y los envíos fallan.

La causa de fondo es que el id de la conexión no es solo una dirección: es la **identidad** de varias cosas que deberían sobrevivir a un cambio de conexión.

## 2. Hallazgos verificados en el código

Conduit (`messaging-service`):

| Hecho                                                                                                                                                       | Dónde                                                      | Consecuencia                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| El bot se enlaza a la conexión con `WhatsAppConnection.botConfigId` (opcional). Un bot puede tener varias conexiones, pero cada conexión tiene un solo bot. | `prisma/schema.prisma`                                     | No existe hoy "varios bots en una misma conexión".                                     |
| La sesión de Baileys fija el bot al arrancar (`state.botConfigId`); existe `refreshBotConfigId` para cambiarlo en caliente.                                 | `BaileysSessionManager.ts`                                 | Cambiar el bot de una línea ya es posible sin reiniciar.                               |
| Para enviar por WhatsApp, `connectionId` es obligatorio.                                                                                                    | `MessageOrchestrator.ts`                                   | El backend no puede enviar sin conocer el id.                                          |
| Contactos, bajas (opt-out), sesión, nivel de calentamiento y riesgo cuelgan del id de conexión.                                                             | `WhatsAppContact`, `WhatsAppSession`, `WhatsAppConnection` | Crear una conexión nueva empieza de cero: pierde bajas y calentamiento.                |
| Las conversaciones son únicas por `(botConfigId, phoneNumber)`; `lastConnectionId` es solo informativo.                                                     | `Conversation`                                             | Dos bots hablando con la misma clienta crearían dos conversaciones separadas.          |
| Si el bot no está `ACTIVE`, el mensaje se descarta **antes** de guardarse.                                                                                  | `BotRouter.handleMessage`                                  | Hoy "apagar el bot" hace que el chat no quede en Conversaciones. Es un defecto aparte. |

Backend (`leonice_spa_backend`): el panel y los envíos leen `botId()` y `connectionId()` de la configuración del servidor, no de Conduit.

## 3. Principios para no dañar el sistema

1. **Cada fase es aditiva y reversible.** Columnas nuevas opcionales, rutas nuevas, comportamiento por defecto idéntico al actual.
2. **Compatibilidad hacia atrás.** Mientras una variable de entorno exista, manda; la resolución por clave solo se usa si se activa o si falta la variable.
3. **Orden de despliegue fijo:** primero la migración de Conduit, luego Conduit, luego el backend, y al final el frontend.
4. **Una fase no empieza hasta que la anterior se verificó** con una prueba real en el entorno de pruebas y no solo con pruebas unitarias.
5. **Nunca se borran identificadores viejos** en la misma fase que se introducen los nuevos.
6. **Una consulta de configuración nunca puede tumbar la atención**: ante un fallo, se usa el último valor conocido y se avisa en el log.

## 4. Propuesta

### Conceptos

- **Línea**: un número de WhatsApp del negocio. Es lo que hoy se llama conexión, pero con una **clave estable** (`principal`, `ventas`…) única por tenant.
- **Bot**: configuración de asistente, también con una **clave estable** única por tenant (`recepcion`).
- **Regla de enrutamiento**: decide qué bot atiende un mensaje entrante. Orden de prioridad: regla por contacto, luego bot por defecto de la línea, luego bot por defecto del tenant.
- La clave de la línea es la "clave que ayuda a identificar". El id de Conduit (UUID) pasa a ser un detalle interno que el backend resuelve y guarda en caché.

### Fases

**Fase 0 — Pausa del sistema (hecha, pendiente de desplegar).** Bandera por tenant, no por conexión, que sobrevive a cambios de conexión. Detiene al asistente, los avisos y los envíos automáticos sin desconectar. Los chats se siguen guardando.

**Fase 1 — Claves estables y resolución por clave.** _Tamaño: medio. Riesgo: bajo._

- Conduit: columna `key` opcional en `WhatsAppConnection` y `BotConfig`, única por tenant, rellenada desde el nombre actual. Endpoint de consulta por clave.
- Backend: un `ConduitIdentityResolver` que obtiene `{tenantId, botId, connectionId}` a partir de `CONDUIT_LINE_KEY` y `CONDUIT_BOT_KEY`, con caché y recarga si Conduit responde 404 por id caducado. Hasta que se active, se usan las variables actuales.
- Criterio de salida: cambiar el id de la conexión en Conduit no requiere tocar variables del backend.

**Fase 2 — Que la identidad sobreviva a un cambio de conexión.** _Tamaño: medio-grande. Riesgo: medio._

- Conduit: operación "reemplazar conexión" que mueve contactos, bajas, calentamiento y riesgo de la conexión vieja a la nueva dentro de una transacción. Las bajas (opt-out) pasan a depender de `(tenant, número)` y no del id.
- Criterio de salida: re-vincular el número no pierde ninguna baja ni el nivel de calentamiento.
- Riesgo principal: bajas mal migradas significarían escribir a quien pidió no recibir mensajes. Requiere prueba con datos reales copiados, no con la base de desarrollo.

**Fase 3 — Enrutamiento de bot.** _Tamaño: grande. Riesgo: alto._

- Conduit: tabla de reglas `(tenant, línea, tipo de coincidencia, bot, prioridad)` y resolución del bot por mensaje en lugar de por sesión.
- Decisión de fondo: **una sola conversación activa por `(tenant, número de la clienta)`**. Cambiar de bot es un traspaso, no una conversación paralela; si no, el equipo vería chats duplicados.
- Corregir de paso el defecto del bot apagado: guardar siempre el mensaje y solo omitir la respuesta.
- Criterio de salida: dos bots atienden dos números distintos del mismo tenant sin mezclar historial.

**Fase 4 — Backend con varias líneas.** _Tamaño: medio. Riesgo: medio._

- El backend elige la línea por propósito (por ejemplo transaccional y marketing) y el panel muestra las líneas del tenant.
- Los límites de marketing y de calentamiento pasan a medirse por línea.

**Fase 5 — Consolidación.** Retirar las variables de entorno de ids, migrar el panel a gestionar líneas y bots, documentación y runbook.

### Qué no se toca

- El contrato de la API de envío (`POST /messages`) mientras dure la fase 1.
- Las migraciones ya aplicadas.
- La política anti-bloqueo (`campaignPolicy`, calentamiento): solo cambia de dueño en la fase 2, no de reglas.

## 5. Decisiones que necesito de ti

1. **"Asignación de bot según número"**: ¿el número es el de **tu negocio** (cada línea tiene su bot) o el de **la clienta** (ciertas clientas, por ejemplo VIP, van a otro bot)? La fase 3 se diseña distinto según la respuesta. La propuesta cubre ambos, pero conviene priorizar uno.
2. **"Varios bots en una conexión"**: ¿para qué casos concretos? (por área, por horario, por tipo de clienta). Eso define la forma de las reglas.
3. ¿Habrá **más de una empresa (tenant)** pronto, o todo seguirá siendo Leonice? Si es una sola, se puede simplificar la fase 4.
4. ¿Cuándo vas a conectar el **segundo número**? Define la urgencia real de las fases 3 y 4.

## 6. Cómo se valida cada fase

- Pruebas unitarias en cada repo, siguiendo el patrón de `test/unit/bot/chat-isolation.spec.ts` de Conduit.
- Una prueba de punta a punta en un entorno aislado (base y Redis propios, número de pruebas autorizado) antes de producción. No se prueba contra la base de desarrollo.
- Una lista de comprobación posterior al despliegue: salud de Conduit, estado de la conexión, un mensaje entrante real y un envío saliente real.
- Plan de reversión por fase: las columnas nuevas pueden quedar sin usar, y la resolución por clave se apaga quitando las variables `CONDUIT_*_KEY`.

## 7. Estado de la fase 0 y despliegue

Commits locales (sin push):

- Conduit, rama `fix/redis-password`: `b5c86a1`, `275f3d2`, `e58db35`.
- Backend: `1debc90`, `6287074`.
- Frontend: `7139190`.

Pasos de despliegue, en este orden:

1. Aplicar a la base `conduit` la migración `20261108120000_tenant_system_pause` (agrega `Tenant.systemPausedAt`).
2. Push de Conduit y esperar a que Railway lo despliegue.
3. Push del backend.
4. Push del frontend.

No verificado de la fase 0: el comportamiento con un número real de WhatsApp, y la apariencia de los botones en el navegador. Las pruebas unitarias de los tres repos pasan.
