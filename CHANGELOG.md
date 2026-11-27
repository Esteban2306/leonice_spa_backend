# Changelog

## Sin publicar

- La fecha de nacimiento de la clienta es opcional en el panel, la API de reservas y el bot. La de la persona para quien se reserva sigue siendo obligatoria.

## 0.1.0 - 2026-11-27

### Cambios de negocio

- Una persona puede tener varias citas el mismo día y a la misma hora, también de la misma categoría y en reservas separadas. Ya no se corre la hora por cruzarse con otra cita suya.
- Los servicios simultáneos de una misma persona en una categoría ocupan un solo cupo.
- Se sigue rechazando el mismo servicio, para la misma persona, a la misma hora.
- Códigos de error: `PLACEMENT_CATEGORY_DAY_CONFLICT` y `PLACEMENT_CLIENT_OVERLAP` pasan a `PLACEMENT_DUPLICATE_BOOKING`; lo mismo para sus equivalentes al revivir.

### Rendimiento

- Las consultas de citas y anticipos piden solo las columnas que usan y ordenan de forma determinista.
- El filtro de anticipos sin resolver descarta filas en la base de datos.
- `GET /reservations/:id` y `GET /deposits` devuelven menos campos.
