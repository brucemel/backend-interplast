import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import compression from 'compression';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

// ============= CLOUDINARY CONFIG =============
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3001;

// ============= SUPABASE CLIENT =============
// Usar SERVICE_KEY para operaciones de admin (bypasea RLS)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ============= MIDDLEWARE =============
// Helmet con configuración de seguridad estricta
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://trqxmvqbpxpucpexslgz.supabase.co", "https://res.cloudinary.com"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Necesario para cargar imágenes externas
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// CORS: Permitir múltiples orígenes (desarrollo y producción)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://fronted-interplast.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, apps móviles, etc.)
    if (!origin) return callback(null, true);

    // Permitir URLs de preview de Vercel (fronted-interplast-*.vercel.app)
    const isVercelPreview = origin.match(/^https:\/\/fronted-interplast.*\.vercel\.app$/);

    if (allowedOrigins.includes(origin) || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' })); // Reducido para seguridad
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Headers de seguridad adicionales para todas las respuestas
app.use((req, res, next) => {
  // Prevenir que el navegador adivine el tipo de contenido
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Habilitar protección XSS del navegador
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // No enviar información del servidor
  res.removeHeader('X-Powered-By');
  // Cache control para datos sensibles
  if (req.path.startsWith('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Rate limiting general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Rate limiting estricto para login (previene ataques de fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Solo 5 intentos de login por IP
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // No cuenta logins exitosos
});

// Tracking de intentos fallidos por email (bloqueo por cuenta)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutos

const checkLoginAttempts = (email: string): { blocked: boolean; remainingTime?: number } => {
  const attempts = loginAttempts.get(email);
  if (!attempts) return { blocked: false };

  const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
  if (timeSinceLastAttempt > LOCKOUT_TIME) {
    loginAttempts.delete(email);
    return { blocked: false };
  }

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    return { blocked: true, remainingTime: Math.ceil((LOCKOUT_TIME - timeSinceLastAttempt) / 60000) };
  }

  return { blocked: false };
};

const recordFailedLogin = (email: string) => {
  const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: 0 };
  attempts.count += 1;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(email, attempts);
};

const clearLoginAttempts = (email: string) => {
  loginAttempts.delete(email);
};

// ============= AUTH MIDDLEWARE =============
interface AuthRequest extends express.Request {
  userId?: string;
}

const auth = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.substring(7); // Remover 'Bearer '

    // Validar que el token tenga formato JWT básico
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.warn('[SECURITY] Malformed JWT token attempted');
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: ['HS256'], // Solo permitir el algoritmo esperado
      maxAge: '7d' // Verificar que no sea muy viejo
    }) as { id: string; iat: number };

    // Verificar que el token tenga los campos requeridos
    if (!decoded.id) {
      console.warn('[SECURITY] JWT token missing required claims');
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.userId = decoded.id;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada' });
    }
    if (error.name === 'JsonWebTokenError') {
      console.warn('[SECURITY] Invalid JWT token:', error.message);
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('[ERROR] Auth middleware error:', error.message);
    return res.status(401).json({ error: 'Error de autenticación' });
  }
};

// ============= MULTER CONFIG (Upload) =============
const storage = multer.memoryStorage();

// Validar tipos de archivo permitidos
const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Solo permitir imágenes
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes (JPEG, PNG, GIF, WebP).'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max (reducido para seguridad)
    files: 1 // Solo un archivo a la vez
  },
  fileFilter
});

// ============= FUNCIONES DE VALIDACIÓN Y SEGURIDAD =============

// Función para sanitizar texto (prevenir XSS)
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // Remover caracteres HTML peligrosos
    .substring(0, 1000); // Limitar longitud
};

// Función para validar UUID
const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Middleware para validar UUID en parámetros
const validateUUID = (paramName: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const id = req.params[paramName];
    if (!id || !isValidUUID(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    next();
  };
};

// Rate limiter para formulario de contacto (prevenir spam)
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // 5 mensajes por hora por IP
  message: { error: 'Demasiados mensajes enviados. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============= RUTAS PÚBLICAS =============

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV 
  });
});

// GET: Todos los productos
app.get('/api/products', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, slug, icon, color),
        brand:brands(id, name, slug),
        images:product_images(id, url, display_order)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Ordenar imágenes por display_order
    const productsWithSortedImages = data?.map(p => ({
      ...p,
      images: p.images?.sort((a: any, b: any) => a.display_order - b.display_order) || []
    }));

    res.json(productsWithSortedImages || []);
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Productos próximamente (is_featured = true)
// IMPORTANTE: Rutas específicas ANTES de rutas con parámetros
app.get('/api/products/coming-soon', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, slug, icon, color),
        brand:brands(id, name, slug),
        images:product_images(id, url, display_order)
      `)
      .eq('is_featured', true)
      .order('name', { ascending: true });

    if (error) throw error;

    const productsWithSortedImages = data?.map(p => ({
      ...p,
      images: p.images?.sort((a: any, b: any) => a.display_order - b.display_order) || []
    }));

    res.json(productsWithSortedImages || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Productos novedades (is_new = true)
app.get('/api/products/new', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, slug, icon, color),
        brand:brands(id, name, slug),
        images:product_images(id, url, display_order)
      `)
      .eq('is_new', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const productsWithSortedImages = data?.map(p => ({
      ...p,
      images: p.images?.sort((a: any, b: any) => a.display_order - b.display_order) || []
    }));

    res.json(productsWithSortedImages || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Producto por ID
app.get('/api/products/:id', validateUUID('id'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, slug, icon, color),
        brand:brands(id, name, slug),
        images:product_images(id, url, display_order)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    
    // Ordenar imágenes
    if (data?.images) {
      data.images = data.images.sort((a: any, b: any) => a.display_order - b.display_order);
    }
    
    res.json(data);
  } catch (error: any) {
    res.status(404).json({ error: 'Producto no encontrado' });
  }
});

// GET: Categorías
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Marcas
app.get('/api/brands', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST: Formulario de contacto
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, company, email, phone, message } = req.body;

    // Validar campos obligatorios
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de email inválido' });
    }

    // Validar longitud de campos
    if (name.length > 100 || email.length > 100 || message.length > 2000) {
      return res.status(400).json({ error: 'Uno o más campos exceden el límite permitido' });
    }

    // Sanitizar todas las entradas
    const sanitizedData = {
      name: sanitizeInput(name),
      company: sanitizeInput(company || ''),
      email: email.toLowerCase().trim(),
      phone: sanitizeInput(phone || '').replace(/[^\d+\-\s()]/g, ''), // Solo caracteres de teléfono
      message: sanitizeInput(message)
    };

    // Verificar que los campos sanitizados no estén vacíos
    if (!sanitizedData.name || !sanitizedData.email || !sanitizedData.message) {
      return res.status(400).json({ error: 'Campos obligatorios inválidos después de validación' });
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert([sanitizedData])
      .select()
      .single();

    if (error) throw error;

    // No devolver datos sensibles en la respuesta
    res.json({ success: true, message: 'Mensaje enviado correctamente' });
  } catch (error: any) {
    console.error('[ERROR] Error saving contact:', error.message);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});

// ============= RUTAS ADMIN (REQUIEREN AUTH) =============

// POST: Login admin (con protección contra fuerza bruta)
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar que se proporcionen credenciales
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de email inválido' });
    }

    // Normalizar email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim();

    // Verificar si la cuenta está bloqueada por demasiados intentos
    const attemptCheck = checkLoginAttempts(normalizedEmail);
    if (attemptCheck.blocked) {
      console.warn(`[SECURITY] Login blocked for ${normalizedEmail} - too many attempts`);
      return res.status(429).json({
        error: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${attemptCheck.remainingTime} minutos.`
      });
    }

    // Buscar admin (usar tiempo constante para evitar timing attacks)
    const startTime = Date.now();
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    // Si no existe el usuario, igual ejecutar bcrypt con hash dummy para timing constante
    const dummyHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const passwordToCheck = admin?.password || dummyHash;

    const validPassword = await bcrypt.compare(password, passwordToCheck);

    // Asegurar tiempo mínimo de respuesta (previene timing attacks)
    const elapsed = Date.now() - startTime;
    if (elapsed < 200) {
      await new Promise(resolve => setTimeout(resolve, 200 - elapsed));
    }

    if (error || !admin || !validPassword) {
      // Registrar intento fallido
      recordFailedLogin(normalizedEmail);
      console.warn(`[SECURITY] Failed login attempt for: ${normalizedEmail}`);

      // Mensaje genérico (no revelar si el email existe)
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Login exitoso - limpiar intentos fallidos
    clearLoginAttempts(normalizedEmail);
    console.log(`[AUTH] Successful login for: ${normalizedEmail}`);

    // Generar token con claims mínimos
    const token = jwt.sign(
      {
        id: admin.id,
        // No incluir email ni datos sensibles en el token
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
        algorithm: 'HS256'
      }
    );

    // No enviar información sensible en la respuesta
    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (error: any) {
    console.error('[ERROR] Login error:', error.message);
    // No exponer detalles del error
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// GET: Obtener perfil del admin actual
app.get('/api/admin/profile', auth, async (req: AuthRequest, res) => {
  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, email, name')
      .eq('id', req.userId)
      .single();

    if (error || !admin) {
      return res.status(404).json({ error: 'Admin no encontrado' });
    }

    res.json(admin);
  } catch (error: any) {
    console.error('[ERROR] Get profile error:', error.message);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// PUT: Actualizar perfil del admin (nombre y email)
app.put('/api/admin/profile', auth, async (req: AuthRequest, res) => {
  try {
    const { name, email } = req.body;

    // Validar campos
    if (!name || !email) {
      return res.status(400).json({ error: 'Nombre y email son requeridos' });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de email inválido' });
    }

    // Verificar que el email no esté en uso por otro admin
    const normalizedEmail = email.toLowerCase().trim();
    const { data: existingAdmin } = await supabase
      .from('admins')
      .select('id')
      .eq('email', normalizedEmail)
      .neq('id', req.userId)
      .single();

    if (existingAdmin) {
      return res.status(400).json({ error: 'Este email ya está en uso' });
    }

    // Actualizar perfil
    const { data: updatedAdmin, error } = await supabase
      .from('admins')
      .update({
        name: sanitizeInput(name),
        email: normalizedEmail
      })
      .eq('id', req.userId)
      .select('id, email, name')
      .single();

    if (error) throw error;

    console.log(`[AUTH] Profile updated for admin: ${req.userId}`);
    res.json(updatedAdmin);
  } catch (error: any) {
    console.error('[ERROR] Update profile error:', error.message);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// PUT: Cambiar contraseña del admin
app.put('/api/admin/password', auth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validar campos
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    // Validar que las contraseñas coincidan
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    // Validar longitud mínima
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // Obtener admin actual
    const { data: admin, error: fetchError } = await supabase
      .from('admins')
      .select('password')
      .eq('id', req.userId)
      .single();

    if (fetchError || !admin) {
      return res.status(404).json({ error: 'Admin no encontrado' });
    }

    // Verificar contraseña actual
    const validCurrentPassword = await bcrypt.compare(currentPassword, admin.password);
    if (!validCurrentPassword) {
      console.warn(`[SECURITY] Invalid current password for admin: ${req.userId}`);
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Actualizar contraseña
    const { error: updateError } = await supabase
      .from('admins')
      .update({ password: hashedPassword })
      .eq('id', req.userId);

    if (updateError) throw updateError;

    console.log(`[AUTH] Password changed for admin: ${req.userId}`);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    console.error('[ERROR] Change password error:', error.message);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// POST: Crear producto
app.post('/api/admin/products', auth, async (req: AuthRequest, res) => {
  try {
    const productData = req.body;

    // Validar campos requeridos
    if (!productData.code || !productData.name || !productData.category_id) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }

    // Convertir strings vacíos a null para campos UUID opcionales
    if (productData.brand_id === '') productData.brand_id = null;

    // Generar slug
    productData.slug = productData.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');

    const { data, error } = await supabase
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT: Actualizar producto
app.put('/api/admin/products/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const productData = req.body;

    // Convertir strings vacíos a null para campos UUID opcionales
    if (productData.brand_id === '') productData.brand_id = null;
    if (productData.category_id === '') productData.category_id = null;

    // Regenerar slug si cambia el nombre
    if (productData.name) {
      productData.slug = productData.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
    }

    const { data, error } = await supabase
      .from('products')
      .update(productData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar producto
app.delete('/api/admin/products/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Producto eliminado' });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Subir imagen de producto
app.post('/api/admin/products/:id/images', validateUUID('id'), auth, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    // Verificar que no sea video
    if (req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'No se permiten archivos de video' });
    }

    // Subir a Cloudinary - Cloudinary maneja toda la optimización
    console.log('Uploading image to Cloudinary:', req.file.originalname, req.file.mimetype, req.file.size);

    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'interplast/products',
          resource_type: 'image',
          transformation: {
            width: 1000,
            height: 1000,
            crop: 'limit',
            quality: 'auto:good',
            format: 'webp'
          }
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('Cloudinary upload success:', result?.public_id);
            resolve(result);
          }
        }
      );
      uploadStream.end(req.file!.buffer);
    });

    // Obtener el siguiente display_order
    const { data: existingImages } = await supabase
      .from('product_images')
      .select('display_order')
      .eq('product_id', id)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = existingImages && existingImages.length > 0
      ? existingImages[0].display_order + 1
      : 0;

    // Guardar URL de Cloudinary en base de datos
    const { data, error } = await supabase
      .from('product_images')
      .insert([{
        product_id: id,
        url: uploadResult.secure_url,
        display_order: nextOrder
      }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar imagen de producto
app.delete('/api/admin/products/:productId/images/:imageId', validateUUID('productId'), validateUUID('imageId'), auth, async (req: AuthRequest, res) => {
  try {
    const { imageId } = req.params;

    // Eliminar de la base de datos
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId);

    if (error) throw error;
    res.json({ success: true, message: 'Imagen eliminada' });
  } catch (error: any) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear categoría
app.post('/api/admin/categories', auth, async (req: AuthRequest, res) => {
  try {
    const categoryData = req.body;
    
    // Generar slug
    categoryData.slug = categoryData.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');

    const { data, error } = await supabase
      .from('categories')
      .insert([categoryData])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT: Actualizar categoría
app.put('/api/admin/categories/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const categoryData = req.body;

    // Regenerar slug si cambia el nombre
    if (categoryData.name) {
      categoryData.slug = categoryData.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
    }

    const { data, error } = await supabase
      .from('categories')
      .update(categoryData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar categoría
app.delete('/api/admin/categories/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Subir imagen de categoría
app.post('/api/admin/categories/:id/image', validateUUID('id'), auth, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    }

    // Subir a Cloudinary
    console.log('Uploading category image to Cloudinary:', req.file.originalname);

    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'interplast/categories',
          resource_type: 'image',
          transformation: {
            width: 500,
            height: 500,
            crop: 'limit',
            quality: 'auto:good',
            format: 'webp'
          }
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('Cloudinary upload success:', result?.public_id);
            resolve(result);
          }
        }
      );
      uploadStream.end(req.file!.buffer);
    });

    // Actualizar categoría con la URL de la imagen
    const { data, error } = await supabase
      .from('categories')
      .update({ image_url: uploadResult.secure_url })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error uploading category image:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST: Crear marca
app.post('/api/admin/brands', auth, async (req: AuthRequest, res) => {
  try {
    const brandData = req.body;
    
    // Generar slug
    brandData.slug = brandData.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');

    const { data, error } = await supabase
      .from('brands')
      .insert([brandData])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error creating brand:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT: Actualizar marca
app.put('/api/admin/brands/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const brandData = req.body;

    if (brandData.name) {
      brandData.slug = brandData.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
    }

    const { data, error } = await supabase
      .from('brands')
      .update(brandData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error updating brand:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar marca
app.delete('/api/admin/brands/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('brands')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Marca eliminada' });
  } catch (error: any) {
    console.error('Error deleting brand:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Mensajes de contacto
app.get('/api/admin/contacts', auth, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT: Marcar mensaje como leído
app.put('/api/admin/contacts/:id/read', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('contacts')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error marking contact as read:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: Eliminar mensaje
app.delete('/api/admin/contacts/:id', validateUUID('id'), auth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Mensaje eliminado' });
  } catch (error: any) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET: Estadísticas
app.get('/api/admin/stats', auth, async (req: AuthRequest, res) => {
  try {
    const [products, categories, brands, contacts] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('categories').select('*', { count: 'exact', head: true }),
      supabase.from('brands').select('*', { count: 'exact', head: true }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('is_read', false)
    ]);

    const available = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available');

    res.json({
      totalProducts: products.count || 0,
      availableProducts: available.count || 0,
      outOfStock: (products.count || 0) - (available.count || 0),
      totalCategories: categories.count || 0,
      totalBrands: brands.count || 0,
      unreadMessages: contacts.count || 0
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= ERROR HANDLERS =============
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============= START SERVER =============
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 INTERPLAST Backend Running       ║
║                                        ║
║   Port: ${PORT}                        ║
║   Env:  ${process.env.NODE_ENV}        ║
║   API:  http://localhost:${PORT}/api   ║
║                                        ║
╚════════════════════════════════════════╝
  `);
});

export default app;