-- ============================================================
-- Migration 016 (v2, Fase 4): Fecha de nacimiento en contactos
-- ============================================================
-- Para el tablero de cumpleaños. Si el vCard trae BDAY sin año,
-- se guarda con año 1900 (centinela = "año desconocido"); el
-- tablero entonces no calcula la edad pero sí el día.
-- Idempotente.
-- ============================================================

ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date;

SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contactos' AND column_name = 'fecha_nacimiento';
-- Esperado: 1 fila.
