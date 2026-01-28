import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const filePath = '/Users/bruce/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/CD1AEE25-2D71-4120-B982-76D34FBD2608/Productos1 2.xlsx';

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const productos = data.slice(1);

console.log('=== ACTUALIZANDO PRODUCTOS "PRÓXIMAMENTE" ===\n');
console.log('Usando: is_featured = true, status = out_of_stock\n');

let actualizados = 0;

for (const row of productos) {
  const codigo = row[0];
  const stockText = row[4];

  if (!codigo) continue;

  // Solo procesar productos con "va a llegar"
  if (stockText && stockText.toLowerCase().includes('va a llegar')) {
    const { data: updated, error } = await supabase
      .from('products')
      .update({
        status: 'out_of_stock',  // Sin stock
        is_featured: true        // Próximamente
      })
      .eq('code', codigo.trim())
      .select('code, name');

    if (!error && updated && updated.length > 0) {
      console.log('OK [PRÓXIMAMENTE] ' + codigo + ' - ' + updated[0].name);
      actualizados++;
    }
  }
}

console.log('\n=== RESUMEN ===');
console.log('Marcados como próximamente (is_featured=true): ' + actualizados);
