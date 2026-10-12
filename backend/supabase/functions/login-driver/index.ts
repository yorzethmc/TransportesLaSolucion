// ==============================================================================
// EDGE FUNCTION: LOGIN-DRIVER (AUTENTICACIÓN POR TELÉFONO Y CONTRASEÑA)
// Transportes La Solución - V1.2
// Resuelve el email técnico invisible 506XXXXXXXX@drivers.internal
// No revela existencia de cuenta y aplica rate limiting contra ataques de fuerza bruta.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiter en memoria para intentos de login: máximo 5 fallos por IP cada 15 minutos
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const loginFailures = new Map<string, { count: number; firstAttempt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = loginFailures.get(key);

  if (!record) return false;
  if (now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const record = loginFailures.get(key);
  if (!record || now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

function clearFailure(key: string): void {
  loginFailures.delete(key);
}

function normalizePhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("506") && digits.length === 11) return digits;
  if (digits.length === 8) return `506${digits}`;
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabasePublishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const supabaseSecretKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? "";

    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown-ip";

    const rateKey = `login_ip:${clientIp}`;

    if (isRateLimited(rateKey)) {
      return new Response(
        JSON.stringify({ error: "Demasiados intentos de acceso. Por seguridad, intente en 15 minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { phoneNumber, password } = await req.json();

    if (!phoneNumber || !password) {
      return new Response(
        JSON.stringify({ error: "Credenciales inválidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = normalizePhoneNumber(String(phoneNumber));
    if (normalizedPhone.length < 8) {
      recordFailure(rateKey);
      return new Response(
        JSON.stringify({ error: "Credenciales inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const technicalEmail = `${normalizedPhone}@drivers.internal`;

    // 1. Intentar inicio de sesión mediante cliente público con Publishable Key
    const publicClient = createClient(supabaseUrl, supabasePublishableKey);
    const { data: authData, error: authError } = await publicClient.auth.signInWithPassword({
      email: technicalEmail,
      password: String(password),
    });

    if (authError || !authData.session || !authData.user) {
      recordFailure(rateKey);
      // No revelar si el teléfono existe o si la clave fue errónea
      return new Response(
        JSON.stringify({ error: "Credenciales inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Comprobar que el usuario tenga rol 'driver' y esté activo
    const serviceClient = createClient(supabaseUrl, supabaseSecretKey);
    const { data: driverRecord } = await serviceClient
      .from("drivers")
      .select("id, active, must_change_password, full_name, assigned_vehicle_id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (!driverRecord || driverRecord.active !== true) {
      recordFailure(rateKey);
      return new Response(
        JSON.stringify({ error: "Credenciales inválidas o cuenta inactiva" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limpiar intentos fallidos tras login exitoso
    clearFailure(rateKey);

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: authData.session.expires_at,
        },
        driver: {
          id: driverRecord.id,
          fullName: driverRecord.full_name,
          phoneNumber: normalizedPhone,
          mustChangePassword: driverRecord.must_change_password,
          assignedVehicleId: driverRecord.assigned_vehicle_id,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
