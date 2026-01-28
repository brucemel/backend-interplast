import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Ver estructura de un producto
const { data, error } = await supabase
  .from('products')
  .select('*')
  .limit(1);

console.log('Estructura de productos:');
console.log(JSON.stringify(data[0], null, 2));
console.log('\nCampos disponibles:', Object.keys(data[0]));
