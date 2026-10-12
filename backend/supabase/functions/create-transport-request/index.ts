// ==============================================================================
// EDGE FUNCTION: CREATE-TRANSPORT-REQUEST (ENDPOINT PÚBLICO SEGURO DE SOLICITUDES)
// Transportes La Solución - V1.2
// Valida server-side, aplica rate limiting por IP/Teléfono, persiste y devuelve correlativo.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiter en memoria por ventana deslizante (10 minutos)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestAttempts = new Map<string, { count: number; firstAttempt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = requestAttempts.get(key);

  if (!record) {
    requestAttempts.set(key, { count: 1, firstAttempt: now });
    return false;
  }

  if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    requestAttempts.set(key, { count: 1, firstAttempt: now });
    return false;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  record.count += 1;
  return false;
}

interface CreateRequestPayload {
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  tripDate: string;
  tripTime?: string;
  originAddress: string;
  destinationAddress: string;
  adultsCount: number;
  minorsCount: number;
  hasLuggage: boolean;
  specialNotes?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupAccuracyMeters?: number;
  pickupCanton?: string;
  pickupDistrict?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseSecretKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
    const client = createClient(supabaseUrl, supabaseSecretKey);

    // Obtener IP del cliente para rate limiting
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown-ip";

    if (isRateLimited(`ip:${clientIp}`)) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes. Intente más tarde." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: CreateRequestPayload = await req.json();

    // 1. Validación server-side estricta
    const cleanPhone = (body.customerPhone || "").replace(/\D/g, "");
    const normalizedPhone = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;

    if (isRateLimited(`phone:${normalizedPhone}`)) {
      return new Response(JSON.stringify({ error: "Demasiadas solicitudes para este número telefónico." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.customerName || body.customerName.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Nombre inválido (mínimo 2 caracteres)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalizedPhone.length < 8) {
      return new Response(JSON.stringify({ error: "Número telefónico inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.originAddress || !body.destinationAddress || !body.tripDate) {
      return new Response(JSON.stringify({ error: "Origen, destino y fecha de viaje son obligatorios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Inserción segura en PostgreSQL utilizando el servicio
    const { data, error } = await client
      .from("transport_requests")
      .insert({
        customer_name: body.customerName.trim(),
        customer_phone: normalizedPhone,
        customer_whatsapp: body.customerWhatsapp ? body.customerWhatsapp.replace(/\D/g, "") : normalizedPhone,
        trip_date: body.tripDate,
        trip_time: body.tripTime || null,
        origin_address: body.originAddress.trim(),
        destination_address: body.destinationAddress.trim(),
        adults_count: Math.max(1, body.adultsCount || 1),
        minors_count: Math.max(0, body.minorsCount || 0),
        has_luggage: Boolean(body.hasLuggage),
        special_notes: body.specialNotes ? body.specialNotes.trim() : null,
        pickup_latitude: body.pickupLatitude || null,
        pickup_longitude: body.pickupLongitude || null,
        pickup_accuracy_meters: body.pickupAccuracyMeters || null,
        pickup_canton: body.pickupCanton || null,
        pickup_district: body.pickupDistrict || null,
        status: "new",
      })
      .select("id, request_number, created_at")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: "No fue posible registrar la solicitud" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: data.id,
        requestNumber: data.request_number,
        createdAt: data.created_at,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Error interno al procesar solicitud" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
