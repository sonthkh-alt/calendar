import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Nếu chưa cấu hình env, supabase = null -> app hiện thông báo hướng dẫn cấu hình.
export const supabase = url && key ? createClient(url, key) : null;
