// Script para resetear y crear nuevos admins
// Ejecutar: node scripts/reset-admins.mjs

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// Usar variables de entorno o valores por defecto
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://trqxmvqbpxpucpexslgz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_secret_tEey6dSSEvmGAw9uX5S-Vw_i70j2SSe';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============= NUEVAS CUENTAS =============
const ADMINS = [
  {
    email: 'admin@interplast.pe',
    password: 'Interpl@st_2024#Admin',
    name: 'Administrador Principal'
  },
  {
    email: 'backup@interplast.pe',
    password: 'B@ckup_Interpl@st#2024',
    name: 'Administrador Backup'
  }
];

async function resetAdmins() {
  console.log('='.repeat(50));
  console.log('RESETEANDO CUENTAS DE ADMINISTRADOR');
  console.log('='.repeat(50));

  // 1. Eliminar todas las cuentas existentes
  console.log('\n[1/3] Eliminando cuentas anteriores...');
  const { error: deleteError } = await supabase
    .from('admins')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Elimina todos

  if (deleteError) {
    console.error('Error eliminando cuentas:', deleteError.message);
    return;
  }
  console.log('    Cuentas anteriores eliminadas');

  // 2. Crear nuevas cuentas
  console.log('\n[2/3] Creando nuevas cuentas...');

  for (const admin of ADMINS) {
    const hashedPassword = await bcrypt.hash(admin.password, 12); // Factor 12 para mayor seguridad

    const { error } = await supabase
      .from('admins')
      .insert([{
        email: admin.email,
        password: hashedPassword,
        name: admin.name
      }]);

    if (error) {
      console.error(`    Error creando ${admin.email}:`, error.message);
    } else {
      console.log(`    ${admin.name} creado`);
    }
  }

  // 3. Mostrar credenciales
  console.log('\n[3/3] NUEVAS CREDENCIALES');
  console.log('='.repeat(50));
  console.log('\n CUENTA PRINCIPAL:');
  console.log(`    Email:    ${ADMINS[0].email}`);
  console.log(`    Password: ${ADMINS[0].password}`);
  console.log('\n CUENTA DE EMERGENCIA:');
  console.log(`    Email:    ${ADMINS[1].email}`);
  console.log(`    Password: ${ADMINS[1].password}`);
  console.log('\n' + '='.repeat(50));
  console.log('IMPORTANTE: Guarda estas credenciales en un lugar seguro!');
  console.log('='.repeat(50));
}

resetAdmins();
