package com.transporteslasolucion.chofer

import android.content.Intent
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "Tracking")
class TrackingPlugin : Plugin() {

    @PluginMethod
    fun startShift(call: PluginCall) {
        val driverId = call.getString("driverId")
        val deviceId = call.getString("deviceId") ?: "DEVICE_${Build.MODEL}"
        val vehicleId = call.getString("vehicleId")
        val tripId = call.getString("tripId")
        val authToken = call.getString("authToken")
        val supabaseUrl = call.getString("supabaseUrl")
        val publishableKey = call.getString("publishableKey") ?: call.getString("anonKey")

        if (driverId.isNullOrEmpty()) {
            call.reject("driverId es obligatorio para iniciar turno")
            return
        }

        // Guardar credenciales cifradas para el worker en segundo plano
        if (!authToken.isNullOrEmpty() && !supabaseUrl.isNullOrEmpty()) {
            try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()

                val prefs = EncryptedSharedPreferences.create(
                    context,
                    "tls_secure_driver_prefs",
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )

                prefs.edit()
                    .putString("auth_token", authToken)
                    .putString("supabase_url", supabaseUrl)
                    .putString("supabase_publishable_key", publishableKey ?: "")
                    .apply()
            } catch (_e: Exception) {}
        }

        val intent = Intent(context, GpsForegroundService::class.java).apply {
            action = GpsForegroundService.ACTION_START
            putExtra("driver_id", driverId)
            putExtra("device_id", deviceId)
            putExtra("vehicle_id", vehicleId)
            putExtra("trip_id", tripId)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }

        val res = JSObject().apply {
            put("running", true)
            put("message", "Turno iniciado con captura GPS en segundo plano")
        }
        call.resolve(res)
    }

    @PluginMethod
    fun stopShift(call: PluginCall) {
        val intent = Intent(context, GpsForegroundService::class.java).apply {
            action = GpsForegroundService.ACTION_STOP
        }
        context.startService(intent)

        val res = JSObject().apply {
            put("running", false)
            put("message", "Turno finalizado y GPS detenido")
        }
        call.resolve(res)
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getInstance(context)
            val pendingCount = db.gpsSampleDao().getPendingCount()

            val res = JSObject().apply {
                put("running", GpsForegroundService.isServiceRunning)
                put("pendingCount", pendingCount)
            }
            call.resolve(res)
        }
    }

    @PluginMethod
    fun getPendingCount(call: PluginCall) {
        CoroutineScope(Dispatchers.IO).launch {
            val db = AppDatabase.getInstance(context)
            val pendingCount = db.gpsSampleDao().getPendingCount()

            val res = JSObject().apply {
                put("pendingCount", pendingCount)
            }
            call.resolve(res)
        }
    }
}
