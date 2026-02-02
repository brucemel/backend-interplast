import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  console.log('🔄 Agregando columnas de dimensiones a la tabla products...\n');

  // Usar SQL directo para agregar las columnas
  const { error: lengthError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE products ADD COLUMN IF NOT EXISTS length DECIMAL(10,2);`
  });

  const { error: widthError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE products ADD COLUMN IF NOT EXISTS width DECIMAL(10,2);`
  });

  const { error: heightError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE products ADD COLUMN IF NOT EXISTS height DECIMAL(10,2);`
  });

  if (lengthError) {
    console.log('⚠️  Error con columna length:', lengthError.message);
  } else {
    console.log('✅ Columna "length" agregada o ya existía');
  }

  if (widthError) {
    console.log('⚠️  Error con columna width:', widthError.message);
  } else {
    console.log('✅ Columna "width" agregada o ya existía');
  }

  if (heightError) {
    console.log('⚠️  Error con columna height:', heightError.message);
  } else {
    console.log('✅ Columna "height" agregada o ya existía');
  }

  console.log('\n✨ Script completado!');
  console.log('\n📝 Si hubo errores, puedes ejecutar este SQL directamente en Supabase:');
  console.log(`
ALTER TABLE products ADD COLUMN IF NOT EXISTS length DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height DECIMAL(10,2);
  `);
}

main().catch(console.error);
