import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Obtener categorías
const { data: categories, error: catError } = await supabase
  .from('categories')
  .select('*')
  .order('name');

console.log('=== CATEGORÍAS EXISTENTES ===');
if (catError) {
  console.error('Error:', catError);
} else {
  categories.forEach(c => console.log('ID: ' + c.id + ' | Nombre: ' + c.name + ' | Slug: ' + c.slug));
}

// Obtener productos con sus categorías
const { data: products, error: prodError } = await supabase
  .from('products')
  .select('id, code, name, category:categories(id, name)')
  .order('name');

console.log('\n=== PRODUCTOS Y SUS CATEGORÍAS ===');
if (prodError) {
  console.error('Error:', prodError);
} else {
  products.forEach(p => {
    const catName = p.category ? p.category.name : 'SIN CATEGORÍA';
    console.log('[' + catName + '] ' + p.code + ' - ' + p.name);
  });
  console.log('\nTotal productos: ' + products.length);
}
