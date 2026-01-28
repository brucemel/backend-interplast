import XLSX from 'xlsx';

const filePath = '/Users/bruce/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/CD1AEE25-2D71-4120-B982-76D34FBD2608/Productos1 2.xlsx';

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Buscar productos con "va a llegar"
const productos = data.slice(1);

console.log('=== PRODUCTOS "VA A LLEGAR" ===\n');

let count = 0;
for (const row of productos) {
  const codigo = row[0];
  const nombre = row[1];
  const stockText = row[4];

  if (stockText && stockText.toLowerCase().includes('va a llegar')) {
    console.log(codigo + ' - ' + nombre + ' [' + stockText + ']');
    count++;
  }
}

console.log('\nTotal productos "va a llegar": ' + count);
