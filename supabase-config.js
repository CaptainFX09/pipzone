const SUPABASE_URL = 'https://nzasmkplxzirnqeteclv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ywmF35YANKsFEdZOs8wDdQ__jIezHTF';

// ============================================
// Supabase Client
// ============================================

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);