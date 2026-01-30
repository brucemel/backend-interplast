import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  console.log('🔄 Iniciando script...\n');

  // 1. Crear categoría "Colgadores" si no existe
  console.log('📁 Verificando/Creando categoría "Colgadores"...');

  let { data: existingCategory } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', 'colgadores')
    .single();

  let categoryId: string;

  if (existingCategory) {
    console.log('   ✅ La categoría ya existe:', existingCategory.name);
    categoryId = existingCategory.id;
  } else {
    // Obtener el máximo display_order
    const { data: categories } = await supabase
      .from('categories')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = categories && categories.length > 0
      ? categories[0].display_order + 1
      : 0;

    const { data: newCategory, error } = await supabase
      .from('categories')
      .insert([{
        name: 'Colgadores',
        slug: 'colgadores',
        icon: 'Hook',  // Puedes cambiar el icono después
        color: '#8B4513',  // Marrón, puedes cambiarlo
        display_order: nextOrder
      }])
      .select()
      .single();

    if (error) {
      console.error('   ❌ Error creando categoría:', error.message);
      process.exit(1);
    }

    console.log('   ✅ Categoría creada:', newCategory.name);
    categoryId = newCategory.id;
  }

  // 2. Buscar productos con "colgador" en el nombre (case insensitive)
  console.log('\n🔍 Buscando productos con "colgador" en el nombre...');

  const { data: allProducts, error: fetchError } = await supabase
    .from('products')
    .select('id, name, code, category_id');

  if (fetchError) {
    console.error('   ❌ Error obteniendo productos:', fetchError.message);
    process.exit(1);
  }

  // Filtrar productos que contengan "colgador" (con posibles errores ortográficos)
  const colgadorPatterns = [
    /colgador/i,
    /colador/i,      // Error común: falta la 'g'
    /colgadore/i,    // Error común: falta la 's'
    /colgadors/i,    // Error común: sin 'e'
    /cogador/i,      // Error común: falta la 'l'
    /colagador/i,    // Error común: letras extra
  ];

  const productosColgadores = allProducts?.filter(p =>
    colgadorPatterns.some(pattern => pattern.test(p.name))
  ) || [];

  if (productosColgadores.length === 0) {
    console.log('   ⚠️  No se encontraron productos con "colgador" en el nombre');
    console.log('\n📋 Lista de todos los productos para revisar:');
    allProducts?.slice(0, 20).forEach(p => console.log(`   - ${p.name}`));
    if (allProducts && allProducts.length > 20) {
      console.log(`   ... y ${allProducts.length - 20} más`);
    }
    process.exit(0);
  }

  console.log(`   ✅ Encontrados ${productosColgadores.length} productos:\n`);

  // 3. Mostrar y corregir nombres, actualizar categoría
  for (const producto of productosColgadores) {
    // Corregir nombre si está mal escrito
    let nombreCorregido = producto.name;

    // Corregir errores comunes de ortografía
    nombreCorregido = nombreCorregido
      .replace(/colador(?!a)/gi, 'Colgador')  // colador -> Colgador (pero no coladera)
      .replace(/colgadore\b/gi, 'Colgadores')
      .replace(/colgadors\b/gi, 'Colgadores')
      .replace(/cogador/gi, 'Colgador')
      .replace(/colagador/gi, 'Colgador');

    const necesitaCorreccion = nombreCorregido !== producto.name;
    const necesitaCambioCategoria = producto.category_id !== categoryId;

    if (necesitaCorreccion || necesitaCambioCategoria) {
      console.log(`   📦 ${producto.code}: "${producto.name}"`);

      if (necesitaCorreccion) {
        console.log(`      → Nombre corregido: "${nombreCorregido}"`);
      }
      if (necesitaCambioCategoria) {
        console.log(`      → Asignando a categoría: Colgadores`);
      }

      const { error: updateError } = await supabase
        .from('products')
        .update({
          name: nombreCorregido,
          slug: nombreCorregido.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
          category_id: categoryId
        })
        .eq('id', producto.id);

      if (updateError) {
        console.log(`      ❌ Error: ${updateError.message}`);
      } else {
        console.log(`      ✅ Actualizado`);
      }
    } else {
      console.log(`   📦 ${producto.code}: "${producto.name}" - Ya está correcto`);
    }
  }

  console.log('\n✨ Script completado!');
}

main().catch(console.error);
