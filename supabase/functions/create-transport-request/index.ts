// ==============================================================================
// EDGE FUNCTION: CREATE-TRANSPORT-REQUEST (ENDPOINT PÚBLICO SEGURO DE SOLICITUDES)
// Transportes La Solución - V1.1
// Valida server-side, crea correlativo TLS-YYYYMMDD-XXXX y devuelve confirmación.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const client = createClient(supabaseUrl, supabaseAnonKey);

    const body: CreateRequestPayload = await req.json();

    // 1. Validación server-side
    const cleanPhone = (body.customerPhone || "").replace(/\D/g, "");
    const normalizedPhone = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;

    if (!body.customerName || body.customerName.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Nombre inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalizedPhone.length < 8) {
      return new Response(JSON.stringify({ error: "Teléfono inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.originAddress || !body.destinationAddress || !body.tripDate) {
      return new Response(JSON.stringify({ error: "Origen, destino y fecha son obligatorios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Inserción en base de datos PostgreSQL
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
      return new Response(JSON.stringify({ error: `Error al persistir solicitud: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      id: data.id,
      requestNumber: data.request_number,
      createdAt: data.created_at,
    }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Error interno: ${message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
