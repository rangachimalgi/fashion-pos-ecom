import { createClient } from '@supabase/supabase-js';

// TypeScript Tip: 'process.env' variables can sometimes be undefined. 
// Adding the '!' at the end tells TypeScript: "Trust me, I have configured this in .env.local"
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Initialize a single instance of the Supabase Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Keeps your cashiers and customers logged in across browser refreshes
    autoRefreshToken: true,
  }
});
