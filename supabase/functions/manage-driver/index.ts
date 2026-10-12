// ==============================================================================
// EDGE FUNCTION: MANAGE-DRIVER (GESTIÓN ADMINISTRATIVA SEGURA DE CONDUCTORES)
// Transportes La Solución - V1.1
// Solo ejecutable por usuarios autenticados con rol 'admin'.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateDriverPayload {
  action: "create";
  fullName: string;
  phoneNumber: string; // Ej: 50688888888 o 8888-8888
  whatsappNumber?: string;
  identificationNumber: string;
  licenseNumber: string;
  licenseExpiresAt: string;
  temporaryPassword: string;
  assignedVehicleId?: string;
}

interface UpdateDriverPayload {
  action: "update";
  driverId: string;
  fullName?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  licenseNumber?: string;
  licenseExpiresAt?: string;
  assignedVehicleId?: string;
}

interface ToggleActivePayload {
  action: "toggle_active";
  driverId: string;
  active: boolean;
}

interface ResetPasswordPayload {
  action: "reset_password";
  driverId: string;
  newTemporaryPassword: string;
}

type ManageDriverRequest = 
  | CreateDriverPayload 
  | UpdateDriverPayload 
  | ToggleActivePayload 
  | ResetPasswordPayload;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Falta cabecera Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Cliente público con el token del usuario para verificar que es ADMIN
    const clientUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await clientUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sesión inválida o expirada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar rol admin en base de datos
    const { data: roleCheck } = await clientUser
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Acceso denegado: se requiere rol de administrador" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Cliente de servicio interno (SERVICE_ROLE) para operaciones privilegiadas
    const clientAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const body: ManageDriverRequest = await req.json();

    // =========================================================================
    // ACCIÓN: CREAR CONDUCTOR
    // =========================================================================
    if (body.action === "create") {
      const cleanPhone = body.phoneNumber.replace(/\D/g, "");
      const normalizedPhone = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;
      const technicalEmail = `${normalizedPhone}@drivers.internal`;

      // Verificar duplicados de teléfono en drivers
      const { data: existingDriver } = await clientAdmin
        .from("drivers")
        .select("id")
        .eq("phone_number", normalizedPhone)
        .maybeSingle();

      if (existingDriver) {
        return new Response(JSON.stringify({ error: "Ya existe un conductor con este número telefónico." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Crear usuario en Supabase Auth
      const { data: authCreated, error: createAuthError } = await clientAdmin.auth.admin.createUser({
        email: technicalEmail,
        password: body.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: body.fullName,
          phone: normalizedPhone,
        },
      });

      if (createAuthError || !authCreated.user) {
        return new Response(JSON.stringify({ error: `Error en Auth: ${createAuthError?.message}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUserId = authCreated.user.id;

      // Asignar rol 'driver'
      await clientAdmin.from("user_roles").insert({
        user_id: newUserId,
        role: "driver",
        assigned_by: user.id,
      });

      // Crear ficha en drivers
      const { data: driverRow, error: driverError } = await clientAdmin
        .from("drivers")
        .insert({
          user_id: newUserId,
          full_name: body.fullName,
          identification_number: body.identificationNumber,
          license_number: body.licenseNumber,
          license_expires_at: body.licenseExpiresAt,
          phone: normalizedPhone,
          phone_number: normalizedPhone,
          whatsapp_number: body.whatsappNumber ? body.whatsappNumber.replace(/\D/g, "") : normalizedPhone,
          current_vehicle_id: body.assignedVehicleId || null,
          active: true,
          must_change_password: true,
        })
        .select()
        .single();

      if (driverError) {
        // Rollback de auth si falla
        await clientAdmin.auth.admin.deleteUser(newUserId);
        return new Response(JSON.stringify({ error: `Error en registro de conductor: ${driverError.message}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auditoría
      await clientAdmin.from("audit_logs").insert({
        user_id: user.id,
        action: "CREATE_DRIVER",
        entity_name: "drivers",
        entity_id: driverRow.id,
        new_data: { driver: driverRow },
      });

      return new Response(JSON.stringify({ success: true, driver: driverRow }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACCIÓN: ACTIVAR / DESACTIVAR CONDUCTOR
    // =========================================================================
    if (body.action === "toggle_active") {
      const { data: updatedDriver, error: toggleError } = await clientAdmin
        .from("drivers")
        .update({ active: body.active })
        .eq("id", body.driverId)
        .select()
        .single();

      if (toggleError) {
        return new Response(JSON.stringify({ error: toggleError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Si se desactiva, revocar sesiones en Auth
      if (!body.active && updatedDriver?.user_id) {
        await clientAdmin.auth.admin.signOut(updatedDriver.user_id);
      }

      await clientAdmin.from("audit_logs").insert({
        user_id: user.id,
        action: body.active ? "ACTIVATE_DRIVER" : "DEACTIVATE_DRIVER",
        entity_name: "drivers",
        entity_id: body.driverId,
      });

      return new Response(JSON.stringify({ success: true, driver: updatedDriver }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACCIÓN: RESTABLECER CONTRASEÑA
    // =========================================================================
    if (body.action === "reset_password") {
      const { data: driverData } = await clientAdmin
        .from("drivers")
        .select("user_id")
        .eq("id", body.driverId)
        .single();

      if (!driverData) {
        return new Response(JSON.stringify({ error: "Conductor no encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await clientAdmin.auth.admin.updateUserById(driverData.user_id, {
        password: body.newTemporaryPassword,
      });

      await clientAdmin
        .from("drivers")
        .update({ must_change_password: true })
        .eq("id", body.driverId);

      await clientAdmin.from("audit_logs").insert({
        user_id: user.id,
        action: "RESET_DRIVER_PASSWORD",
        entity_name: "drivers",
        entity_id: body.driverId,
      });

      return new Response(JSON.stringify({ success: true, message: "Contraseña temporal restablecida" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no reconocida" }), {
      status: 400,
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
