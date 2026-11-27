-- Solo lectura. Reservas cuyo precio acordado pudo guardarse en pesos
-- en una columna que va en miles de COP (se muestra 1.000 veces mayor).
--
--   psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f ops/sql/reservas-precio-sospechoso.sql
--
-- (psql no acepta el ?schema=public de Prisma; si la URL pide sslmode, vuelva a agregarlo.)
--
-- Origen posible, por fecha de commit (el despliegue pudo ser después): precio acordado
-- del panel desde 2026-11-20; precio del equipo por el bot, entre 2026-11-20 y 2026-11-23.
--
-- SEGURO:   final_price > 10000, más que el máximo que se podía acordar entonces ($10.000.000).
-- PROBABLE: más de 100 veces el precio máximo de catálogo del servicio.
-- precio_si_es_error es lo que habría debido quedar; confirmar con el spa antes de corregir.
-- Un pago registrado o un envío a Siigo pueden haber copiado el mismo valor; corregir
-- final_price no cambia el payload de Siigo ya guardado, que se reintenta tal cual.

BEGIN TRANSACTION READ ONLY;

SELECT
  CASE WHEN r.final_price > 10000 THEN 'SEGURO' ELSE 'PROBABLE' END AS nivel,
  r.id AS reserva_id,
  r.combo_group_id,
  r.created_at,
  r.scheduled_start,
  r.status,
  r.channel,
  c.name AS clienta,
  t.name AS servicio,
  r.final_price AS precio_guardado_miles,
  ROUND(r.final_price / 1000, 2) AS precio_si_es_error,
  t.base_price_min AS catalogo_min,
  t.base_price_max AS catalogo_max,
  p.total_amount AS pago_total_registrado,
  s.status AS siigo_estado,
  s.payload ->> 'amountCopThousands' AS siigo_monto_miles,
  s.synced_at AS siigo_enviado_en
FROM reservations r
JOIN clients c ON c.id = r.client_id
JOIN treatments t ON t.id = r.treatment_id
LEFT JOIN reservation_payments p ON p.reservation_id = r.id
LEFT JOIN siigo_syncs s ON s.reservation_id = r.id
WHERE r.final_price > 10000
   OR r.final_price > 100 * NULLIF(GREATEST(t.base_price_max, t.base_price_min), 0)
ORDER BY r.created_at DESC;

ROLLBACK;
