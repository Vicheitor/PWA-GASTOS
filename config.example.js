// Configuración de Supabase.
//
// Uso local: copia este archivo como config.js (está en .gitignore) y pega tu anon key.
//   cp config.example.js config.js
//
// En GitHub Pages config.js no existe: la app pide la anon key la primera vez
// y la guarda solo en ese dispositivo.
//
// La anon key (o "publishable key") está en Supabase > Project Settings > API Keys.
// NUNCA uses la service_role key (o "secret key"): la app la rechaza.
window.APP_CONFIG = {
  supabaseUrl: 'https://ejemplo.supabase.co',
  supabaseAnonKey: 'TU_ANON_KEY',
};
