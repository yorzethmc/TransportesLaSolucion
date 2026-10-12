// ==============================================================================
// EDGE FUNCTION: PUBLIC-CONFIG (CONFIGURACIÓN PÚBLICA DE LA PLATAFORMA)
// Transportes La Solución - V1.2
// Devuelve parámetros operativos seguros (número de WhatsApp del dueño, etc.)
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const client = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

    const { data, error } = await client
      .from("app_configuration")
      .select("key, value")
      .in("key", ["company_whatsapp", "company_phone", "support_whatsapp", "company_name"]);

    if (error) {
      return new Response(
        JSON.stringify({
          company_whatsapp: "50688888888",
          company_name: "Transportes La Solución",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const configMap: Record<string, string> = {};
    for (const row of data || []) {
      configMap[row.key] = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
    }

    return new Response(JSON.stringify(configMap), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(
      JSON.stringify({
        company_whatsapp: "50688888888",
        company_name: "Transportes La Solución",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
