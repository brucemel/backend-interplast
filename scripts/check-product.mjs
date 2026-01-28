import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const productId = '884a987a-f9fb-41ed-acb9-8921a84f59d5';

// Verificar si el producto existe
const { data, error } = await supabase
  .from('products')
  .select('*')
  .eq('id', productId);

console.log('Producto encontrado:', data);
console.log('Error:', error);
