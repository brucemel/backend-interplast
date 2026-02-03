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
app.use(helmet());

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // 100 requests por ventana
});
app.use('/api/', limiter);

// ============= AUTH MIDDLEWARE =============
interface AuthRequest extends express.Request {
  userId?: string;
}

const auth = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ============= MULTER CONFIG (Upload) =============
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
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
app.get('/api/products/:id', async (req, res) => {
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
app.post('/api/contact', async (req, res) => {
  try {
    const { name, company, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert([{ name, company, email, phone, message }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error saving contact:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= RUTAS ADMIN (REQUIEREN AUTH) =============

// POST: Login admin
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar admin
    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar password
    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
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
app.put('/api/admin/products/:id', auth, async (req: AuthRequest, res) => {
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
app.delete('/api/admin/products/:id', auth, async (req: AuthRequest, res) => {
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
app.post('/api/admin/products/:id/images', auth, upload.single('image'), async (req: AuthRequest, res) => {
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
app.delete('/api/admin/products/:productId/images/:imageId', auth, async (req: AuthRequest, res) => {
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
app.put('/api/admin/categories/:id', auth, async (req: AuthRequest, res) => {
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
app.delete('/api/admin/categories/:id', auth, async (req: AuthRequest, res) => {
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
app.put('/api/admin/brands/:id', auth, async (req: AuthRequest, res) => {
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
app.delete('/api/admin/brands/:id', auth, async (req: AuthRequest, res) => {
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
app.put('/api/admin/contacts/:id/read', auth, async (req: AuthRequest, res) => {
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
app.delete('/api/admin/contacts/:id', auth, async (req: AuthRequest, res) => {
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