// Script para crear/actualizar admin
// Ejecutar: node scripts/setup-admin.mjs

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = 'https://trqxmvqbpxpucpexslgz.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_tEey6dSSEvmGAw9uX5S-Vw_i70j2SSe';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const ADMIN_EMAIL = 'admin@interplast.pe';
const ADMIN_PASSWORD = 'Admin123!';
const ADMIN_NAME = 'Administrador';

async function setupAdmin() {
  console.log('Configurando admin...');

  // Hash del password
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // Verificar si existe
  const { data: existing } = await supabase
    .from('admins')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .single();

  if (existing) {
    // Actualizar
    const { error } = await supabase
      .from('admins')
      .update({ password: hashedPassword, name: ADMIN_NAME })
      .eq('email', ADMIN_EMAIL);

    if (error) {
      console.error('Error actualizando admin:', error);
      return;
    }
    console.log('Admin actualizado correctamente');
  } else {
    // Crear nuevo
    const { error } = await supabase
      .from('admins')
      .insert([{
        email: ADMIN_EMAIL,
        password: hashedPassword,
        name: ADMIN_NAME
      }]);

    if (error) {
      console.error('Error creando admin:', error);
      return;
    }
    console.log('Admin creado correctamente');
  }

  console.log('\nCredenciales:');
  console.log(`  Email: ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
}

setupAdmin();
