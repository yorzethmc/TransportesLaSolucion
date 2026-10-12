// ==============================================================================
// EDGE FUNCTION: MANAGE-DRIVER (GESTIÓN ADMINISTRATIVA SEGURA DE CONDUCTORES)
// Transportes La Solución - V1.2
// Autorización: Exclusivo para usuarios autenticados con rol 'admin'
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BaseRequest {
  action:
    | "create"
    | "update"
    | "activate"
    | "deactivate"
    | "reset_password"
    | "revoke_sessions"
    | "register_device"
    | "revoke_device"
    | "assign_vehicle";
}

interface CreateDriverPayload extends BaseRequest {
  action: "create";
  fullName: string;
  phoneNumber: string;
  whatsappNumber?: string;
  identificationNumber: string;
  licenseNumber: string;
  licenseExpiresAt: string;
  temporaryPassword: string;
  assignedVehicleId?: string;
}

interface UpdateDriverPayload extends BaseRequest {
  action: "update";
  driverId: string;
  fullName?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  licenseNumber?: string;
  licenseExpiresAt?: string;
  assignedVehicleId?: string;
}

interface ToggleStatusPayload extends BaseRequest {
  action: "activate" | "deactivate";
  driverId: string;
}

interface ResetPasswordPayload extends BaseRequest {
  action: "reset_password";
  driverId: string;
  newTemporaryPassword: string;
}

interface RevokeSessionsPayload extends BaseRequest {
  action: "revoke_sessions";
  driverId: string;
}

interface RegisterDevicePayload extends BaseRequest {
  action: "register_device";
  driverId: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  publicKey?: string;
}

interface RevokeDevicePayload extends BaseRequest {
  action: "revoke_device";
  driverId: string;
  deviceId: string;
}

interface AssignVehiclePayload extends BaseRequest {
  action: "assign_vehicle";
  driverId: string;
  vehicleId: string | null;
}

type ManageDriverPayload =
  | CreateDriverPayload
  | UpdateDriverPayload
  | ToggleStatusPayload
  | ResetPasswordPayload
  | RevokeSessionsPayload
  | RegisterDevicePayload
  | RevokeDevicePayload
  | AssignVehiclePayload;

function normalizePhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("506") && digits.length === 11) return digits;
  if (digits.length === 8) return `506${digits}`;
  return digits;
}

function technicalEmailForPhone(normalizedPhone: string): string {
  return `${normalizedPhone}@drivers.internal`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabasePublishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const supabaseSecretKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
    const authHeader = req.headers.get("Authorization");

    // 1. Validar encabezado de autorización sin revelar detalles
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Validar JWT llamando a auth.getUser con Publishable Key
    const clientUser = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: userError,
    } = await clientUser.auth.getUser();

    if (userError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Cliente privilegiado del servidor con Secret Key para comprobación de rol y operaciones seguras
    const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false },
    });

    // 4. Verificar rol 'admin' desde el servidor en la tabla user_roles
    const { data: roleRecord, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleRecord) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Leer y validar payload
    const body: ManageDriverPayload = await req.json();
    if (!body || !body.action) {
      return new Response(JSON.stringify({ error: "Bad Request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let auditDetails: Record<string, unknown> = {};

    // 6. Enrutamiento de acciones
    switch (body.action) {
      case "create": {
        const payload = body as CreateDriverPayload;
        const normalizedPhone = normalizePhoneNumber(payload.phoneNumber);
        const normalizedWhatsapp = payload.whatsappNumber
          ? normalizePhoneNumber(payload.whatsappNumber)
          : normalizedPhone;
        const techEmail = technicalEmailForPhone(normalizedPhone);

        // Crear usuario en Supabase Auth
        const { data: authCreated, error: createAuthError } =
          await adminClient.auth.admin.createUser({
            email: techEmail,
            password: payload.temporaryPassword,
            email_confirm: true,
            user_metadata: {
              phone_number: normalizedPhone,
              full_name: payload.fullName,
              must_change_password: true,
            },
          });

        if (createAuthError || !authCreated.user) {
          return new Response(
            JSON.stringify({ error: "Error creating driver auth account", details: createAuthError?.message }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const newUserId = authCreated.user.id;

        // Crear perfil
        await adminClient.from("profiles").upsert({
          id: newUserId,
          full_name: payload.fullName,
          phone: normalizedPhone,
        });

        // Asignar rol 'driver'
        await adminClient.from("user_roles").upsert({
          user_id: newUserId,
          role: "driver",
        });

        // Crear registro en tabla drivers
        const { data: driverRecord, error: driverInsertError } = await adminClient
          .from("drivers")
          .insert({
            auth_user_id: newUserId,
            full_name: payload.fullName,
            phone_number: normalizedPhone,
            whatsapp_number: normalizedWhatsapp,
            identification_number: payload.identificationNumber,
            license_number: payload.licenseNumber,
            license_expires_at: payload.licenseExpiresAt,
            assigned_vehicle_id: payload.assignedVehicleId || null,
            active: true,
            must_change_password: true,
          })
          .select()
          .single();

        if (driverInsertError) {
          // Rollback de cuenta auth si falla la inserción
          await adminClient.auth.admin.deleteUser(newUserId);
          return new Response(
            JSON.stringify({ error: "Failed to create driver profile" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        auditDetails = { action: "create", driverId: driverRecord.id, phone: normalizedPhone };
        break;
      }

      case "update": {
        const payload = body as UpdateDriverPayload;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (payload.fullName) updates.full_name = payload.fullName;
        if (payload.phoneNumber) updates.phone_number = normalizePhoneNumber(payload.phoneNumber);
        if (payload.whatsappNumber) updates.whatsapp_number = normalizePhoneNumber(payload.whatsappNumber);
        if (payload.licenseNumber) updates.license_number = payload.licenseNumber;
        if (payload.licenseExpiresAt) updates.license_expires_at = payload.licenseExpiresAt;
        if (payload.assignedVehicleId !== undefined) updates.assigned_vehicle_id = payload.assignedVehicleId;

        const { error: updateError } = await adminClient
          .from("drivers")
          .update(updates)
          .eq("id", payload.driverId);

        if (updateError) {
          return new Response(JSON.stringify({ error: "Update failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        auditDetails = { action: "update", driverId: payload.driverId, fields: Object.keys(updates) };
        break;
      }

      case "activate":
      case "deactivate": {
        const payload = body as ToggleStatusPayload;
        const isActive = payload.action === "activate";
        const { error } = await adminClient
          .from("drivers")
          .update({ active: isActive, updated_at: new Date().toISOString() })
          .eq("id", payload.driverId);

        if (error) {
          return new Response(JSON.stringify({ error: "Status update failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        auditDetails = { action: payload.action, driverId: payload.driverId, active: isActive };
        break;
      }

      case "reset_password": {
        const payload = body as ResetPasswordPayload;
        const { data: driver } = await adminClient
          .from("drivers")
          .select("auth_user_id")
          .eq("id", payload.driverId)
          .single();

        if (!driver?.auth_user_id) {
          return new Response(JSON.stringify({ error: "Driver not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await adminClient.auth.admin.updateUserById(driver.auth_user_id, {
          password: payload.newTemporaryPassword,
          user_metadata: { must_change_password: true },
        });

        await adminClient
          .from("drivers")
          .update({ must_change_password: true, updated_at: new Date().toISOString() })
          .eq("id", payload.driverId);

        auditDetails = { action: "reset_password", driverId: payload.driverId };
        break;
      }

      case "revoke_sessions": {
        const payload = body as RevokeSessionsPayload;
        const { data: driver } = await adminClient
          .from("drivers")
          .select("auth_user_id")
          .eq("id", payload.driverId)
          .single();

        if (driver?.auth_user_id) {
          await adminClient.auth.admin.signOut(driver.auth_user_id);
        }

        auditDetails = { action: "revoke_sessions", driverId: payload.driverId };
        break;
      }

      case "register_device": {
        const payload = body as RegisterDevicePayload;
        const { error } = await adminClient.from("driver_devices").insert({
          driver_id: payload.driverId,
          device_id: payload.deviceId,
          device_name: payload.deviceName || "Dispositivo Móvil",
          platform: payload.platform || "android",
          app_version: payload.appVersion || "1.0.0",
          public_key: payload.publicKey || null,
          active: true,
          registered_at: new Date().toISOString(),
        });

        if (error) {
          return new Response(JSON.stringify({ error: "Device registration failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        auditDetails = { action: "register_device", driverId: payload.driverId, deviceId: payload.deviceId };
        break;
      }

      case "revoke_device": {
        const payload = body as RevokeDevicePayload;
        const { error } = await adminClient
          .from("driver_devices")
          .update({ active: false, revoked_at: new Date().toISOString() })
          .eq("driver_id", payload.driverId)
          .eq("device_id", payload.deviceId);

        if (error) {
          return new Response(JSON.stringify({ error: "Device revocation failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        auditDetails = { action: "revoke_device", driverId: payload.driverId, deviceId: payload.deviceId };
        break;
      }

      case "assign_vehicle": {
        const payload = body as AssignVehiclePayload;
        const { error } = await adminClient
          .from("drivers")
          .update({
            assigned_vehicle_id: payload.vehicleId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payload.driverId);

        if (error) {
          return new Response(JSON.stringify({ error: "Vehicle assignment failed" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        auditDetails = { action: "assign_vehicle", driverId: payload.driverId, vehicleId: payload.vehicleId };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Registrar en audit_logs de forma no bloqueante
    try {
      await adminClient.from("audit_logs").insert({
        actor_user_id: callerUser.id,
        action: `manage_driver_${body.action}`,
        entity_name: "drivers",
        details: auditDetails,
      });
    } catch (_auditErr) {
      // Registrar log sin interrumpir la operación exitosa
    }

    return new Response(JSON.stringify({ success: true, details: auditDetails }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
