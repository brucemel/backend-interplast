import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const filePath = '/Users/bruce/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/CD1AEE25-2D71-4120-B982-76D34FBD2608/Productos1 2.xlsx';

// Leer el archivo Excel
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Saltar la fila de encabezados
const productos = data.slice(1);

console.log('=== ACTUALIZANDO STOCK DE PRODUCTOS ===\n');

let actualizados = 0;
let noEncontrados = 0;
let errores = 0;

for (const row of productos) {
  const codigo = row[0];
  const stockText = row[4];

  if (!codigo) continue;

  // Mapear "si hay"/"no hay" a status
  const status = stockText && stockText.toLowerCase().includes('si hay')
    ? 'available'
    : 'out_of_stock';

  // Actualizar en Supabase
  const { data: updated, error } = await supabase
    .from('products')
    .update({ status })
    .eq('code', codigo.trim())
    .select('code, name, status');

  if (error) {
    console.log('ERROR ' + codigo + ': ' + error.message);
    errores++;
  } else if (!updated || updated.length === 0) {
    console.log('NO ENCONTRADO: ' + codigo);
    noEncontrados++;
  } else {
    const statusIcon = status === 'available' ? 'EN STOCK' : 'SIN STOCK';
    console.log('OK [' + statusIcon + '] ' + codigo + ' - ' + updated[0].name);
    actualizados++;
  }
}

console.log('\n=== RESUMEN ===');
console.log('Actualizados: ' + actualizados);
console.log('No encontrados: ' + noEncontrados);
console.log('Errores: ' + errores);
console.log('Total procesados: ' + productos.length);
