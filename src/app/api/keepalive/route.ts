import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Lightweight ping — just fetch 1 row to keep the project active
    const { error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) throw error;

    return NextResponse.json({ status: 'alive', timestamp: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 });
  }
}
