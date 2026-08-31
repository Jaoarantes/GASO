// Configuração do Supabase.
// Console: supabase.com/dashboard > gaso-solucoes > Project Settings > API Keys
//
// Esta chave (anon/publishable) NÃO é segredo: ela identifica o projeto, não
// autoriza nada por si só. Quem protege os dados são as políticas de Row Level
// Security (RLS) configuradas nas tabelas e no bucket do Storage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://allyziuhotptjoltdkxd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsbHl6aXVob3RwdGpvbHRka3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjQwNjMsImV4cCI6MjEwMzM0MDA2M30.Eut3DDB8uyAH621gKxH-n_t8Kkzt39xAEnovwADbyoU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
