-- Script para agregar campo image_url a la tabla categories
-- Ejecutar este script en Supabase SQL Editor

-- Agregar columna image_url a la tabla categories
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Comentario para documentar el campo
COMMENT ON COLUMN categories.image_url IS 'URL de imagen opcional para la categoría (puede ser link externo o subida a Cloudinary)';
