import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// IDs de categorías
const CATEGORIAS = {
  'Recogedores': '4ef57de2-a517-4851-aac9-aad1479b3279',
  'Bacines': 'c6f87946-f2b3-4dfc-ac8a-9f98c4b7a711',
  'Baldes': '2ee4cf2a-e41e-4fc2-a95c-50c427a7cfb5',
  'Azucareras': '692ad455-087f-48c2-b72e-851532858e6a',
  'Escobas': '73492d94-0d65-4ffa-8fa8-146450ace9fe',
  'Tinas': '7e49301d-97d6-4a98-b7b0-5c8d2f4bfa56',
  'Chiferos': '7c09a57c-cf8b-4dad-8307-d2dc642c1c3e',
  'Platos': '31a8d1ee-8083-4e15-8db1-3dbc01fdce19',
  'Porta Vajillas': 'ce59ca34-baf6-45cc-a871-2842467fa14e',
  'Coladores': '3e9d04b4-af37-4df7-8bd8-3201d1c77ff2',
  'Cestos': '99789766-8dc2-4c05-812d-9d8e4d441127',
  'Canos': '49269cac-26b3-4876-85c9-b48c97d22deb',
  'Tomatodos': '8b131d28-fb36-4845-a2f9-7904e99cc8c1',
  'Tapers': '6fccb70b-4e72-49a5-98c2-76293c8001b5',
  'Otros': 'd668d1e4-f9b2-4db6-807d-98f06a500815',
  'Tachos': '769a4158-6f5a-4526-8f3c-ae345fcc9eb6',
  'Cucharones': '3a1b2882-7b92-4b74-80c7-ffb8b6c7859d',
  'Jaboneras': '67f04b4c-3b46-495d-8f32-28d61bfb58e9'
};

// Correcciones a realizar (código del producto -> nueva categoría y/o nuevo nombre)
const CORRECCIONES = [
  // Recogedores mal categorizados (estaban en "Otros")
  { code: 'KOS-0022', newCategory: 'Recogedores', newName: 'Recogedor clean c/filo de goma' },
  { code: 'KOS-0021', newCategory: 'Recogedores', newName: 'Recogedor clean color' },
  { code: 'RAUL- 0026', newCategory: 'Recogedores', newName: 'Recogedor con filete de goma nazca' },
  { code: 'KOS-0010', newCategory: 'Recogedores', newName: 'Recogedor de 2da - Kosmos' },
  { code: 'HUD-0004', newCategory: 'Recogedores', newName: 'Recogedor de basura Hude' },
  { code: 'RAUL-0025', newCategory: 'Recogedores', newName: 'Recogedor Lapagol' },
  { code: 'PRO-0033', newCategory: 'Recogedores', newName: 'Recogedor municipal' },
  { code: 'GLO-0005', newCategory: 'Recogedores', newName: 'Recogedor Natacha c/filete de goma' },
  { code: 'RAUL-0011', newCategory: 'Recogedores', newName: 'Recogedor Nazca color II' },
  { code: 'RAUL-0018', newCategory: 'Recogedores', newName: 'Recogedor Nazca negro' },
  { code: 'MAG-025', newCategory: 'Recogedores', newName: 'Recogedor Segunda Maginza' },
  { code: 'PRO-0034', newCategory: 'Recogedores', newName: 'Recogedor tiburon c/filo de goma' },
  { code: 'KOS-0018', newCategory: 'Recogedores', newName: 'Palos de recogedor Kosmos' },

  // Bacines mal categorizados (estaban en "Tinas")
  { code: 'BMP-0010', newCategory: 'Bacines', newName: 'Bacin Mimito chico' },
  { code: 'BMP-0011', newCategory: 'Bacines', newName: 'Bacin Robustin grande' },

  // Azucarera mal categorizada (estaba en "Tapers")
  { code: 'DRS-0020', newCategory: 'Azucareras', newName: 'Azucarera con tapa Gaston' },

  // Escoba mal categorizada (estaba en "Baldes")
  { code: 'PRO-0030', newCategory: 'Escobas', newName: 'Escoba baldeador' },

  // Bateas que estaban en "Jaboneras" pero son Tinas
  { code: 'URPI-009', newCategory: 'Tinas', newName: 'Batea Begonia 40lts c/jabonera Urpi' },
  { code: 'URPI-0010', newCategory: 'Tinas', newName: 'Batea Gardenia 40lts c/asas jabonera Urpi' },
  { code: 'IMPO-0005', newCategory: 'Tinas', newName: 'Batea jabonera' },
  { code: 'ANG-0008', newCategory: 'Tinas', newName: 'Batea jabonera 55lts' },
  { code: 'ANG-0007', newCategory: 'Tinas', newName: 'Batea jabonera N*70 - Mold' },
  { code: 'sud-0012', newCategory: 'Tinas', newName: 'Tina con jabonera N*90' },
  { code: 'sud-0011', newCategory: 'Tinas', newName: 'Tina jabonera 70lt' },
  { code: 'RCS-0001', newCategory: 'Tinas', newName: 'Tina jabonera de 40lts Roja' },
  { code: 'sud-0009', newCategory: 'Tinas', newName: 'Tina jabonera de 55lts' },
  { code: 'RCS-0002', newCategory: 'Tinas', newName: 'Tina jabonera de 80 Roja' },
  { code: 'SUD-0014', newCategory: 'Tinas', newName: 'Tina ovalada 35lts con jabonera - Premium' },
  { code: 'SUD-0005', newCategory: 'Tinas', newName: 'Tina ovalada con jabonera de 35 - Sudamericana' },

  // Chifero mal categorizado (estaba en "Otros")
  { code: 'RAUL-0036', newCategory: 'Chiferos', newName: 'Chifero ajicero CH090E' },

  // Plato mal categorizado (estaba en "Otros")
  { code: 'RAUL-0041', newCategory: 'Platos', newName: 'Plato tendido PT225' },

  // Porta Vajillas mal categorizados (estaban en "Otros")
  { code: 'CRA-0001', newCategory: 'Porta Vajillas', newName: 'Porta vajilla gigante de luxe' },
  { code: 'QPL-0009', newCategory: 'Porta Vajillas', newName: 'Porta vajilla' },
  { code: 'BM-0001', newCategory: 'Porta Vajillas', newName: 'Porta vajilla gigante Astrid - BM Plast' },
  { code: 'MAG-019', newCategory: 'Porta Vajillas', newName: 'Porta vajilla Jireh' },
  { code: 'QPL-0001', newCategory: 'Porta Vajillas', newName: 'Porta vajilla Q Plast' },

  // Colador mal categorizado (estaba en "Utilitarios")
  { code: 'MAB-002', newCategory: 'Coladores', newName: 'Colador multiuso color Mbplast' },

  // Cesto mal categorizado (estaba en "Utilitarios")
  { code: 'MAB-039', newCategory: 'Cestos', newName: 'Cesto Puppi multiusos eco' },

  // Canos mal categorizados (estaban en "Otros" o "Utilitarios")
  { code: 'JOR-0001', newCategory: 'Canos', newName: 'Cano Jorplast' },
  { code: 'RAUL-0027', newCategory: 'Canos', newName: 'Cano Raulplast' },
  { code: 'QPL-0075', newCategory: 'Canos', newName: 'Cano multiuso' },

  // Tomatodo mal categorizado (estaba en "Otros")
  { code: 'DOU-0002', newCategory: 'Tomatodos', newName: 'Tomatodo 1 litro/655' },

  // Tapers mal categorizados (estaban en "Tachos")
  { code: 'DUCK-0025', newCategory: 'Tapers', newName: 'Taper Force 1 kilo c/tapa rosca - Transparente Ducke' },
  { code: 'DUCK-0006', newCategory: 'Tapers', newName: 'Taper Kiwi 0.70kg color' },

  // Productos de limpieza mal categorizados (estaban en "Tachos")
  { code: 'PRO-0024', newCategory: 'Otros', newName: 'Lejia 650ml Prolimso' },
  { code: 'PRO-0021', newCategory: 'Otros', newName: 'Limpia todo 900ml Prolimso' },

  // Despensero mal categorizado (estaba en "Tinas")
  { code: 'BMP-0009', newCategory: 'Otros', newName: 'Despensero Valentina 3' },

  // Cesto mal categorizado (estaba en "Tinas")
  { code: 'ANG-0004', newCategory: 'Cestos', newName: 'Cesto batea tin' },

  // Cubiertos mal categorizados (estaban en "Mesas") - los dejamos en Otros ya que no hay categoria Cubiertos
  { code: 'Abh-009', newCategory: 'Otros', newName: 'Cuchara de mesa modelo 18 (CF-18/01)' },
  { code: 'Abh-010', newCategory: 'Otros', newName: 'Tenedor de mesa modelo 18 (CF-18/01)' },

  // Corregir nombres de productos existentes en Recogedores
  { code: 'PRO-0035', newName: 'Recogedor Lorito' },
  { code: 'RAUL-0005', newName: 'Recogedor negro' },
];

async function fixProducts() {
  console.log('=== INICIANDO CORRECCIONES ===\n');

  let exitosos = 0;
  let fallidos = 0;

  for (const correccion of CORRECCIONES) {
    // Buscar el producto por código
    const { data: producto, error: findError } = await supabase
      .from('products')
      .select('id, code, name, category_id')
      .eq('code', correccion.code)
      .single();

    if (findError || !producto) {
      console.log('X No encontrado: ' + correccion.code);
      fallidos++;
      continue;
    }

    // Preparar datos de actualización
    const updateData = {};

    if (correccion.newCategory) {
      updateData.category_id = CATEGORIAS[correccion.newCategory];
    }

    if (correccion.newName) {
      updateData.name = correccion.newName;
      // Actualizar slug también
      updateData.slug = correccion.newName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
    }

    // Actualizar producto
    const { error: updateError } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', producto.id);

    if (updateError) {
      console.log('X Error actualizando ' + correccion.code + ': ' + updateError.message);
      fallidos++;
    } else {
      const cambios = [];
      if (correccion.newCategory) cambios.push('categoria -> ' + correccion.newCategory);
      if (correccion.newName) cambios.push('nombre -> ' + correccion.newName);
      console.log('OK ' + correccion.code + ': ' + cambios.join(', '));
      exitosos++;
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Exitosos: ' + exitosos);
  console.log('Fallidos: ' + fallidos);
  console.log('Total: ' + CORRECCIONES.length);
}

fixProducts().catch(console.error);
