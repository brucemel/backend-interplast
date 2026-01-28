import XLSX from 'xlsx';

const filePath = '/Users/bruce/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/CD1AEE25-2D71-4120-B982-76D34FBD2608/Productos1 2.xlsx';

// Leer el archivo Excel
const workbook = XLSX.readFile(filePath);

// Obtener la primera hoja
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convertir a JSON
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log('=== ESTRUCTURA DEL EXCEL ===');
console.log('Hojas:', workbook.SheetNames);
console.log('\nPrimeras 20 filas:');
data.slice(0, 20).forEach((row, i) => {
  console.log(i + ': ' + JSON.stringify(row));
});

console.log('\nTotal filas:', data.length);
