package com.transporteslasolucion.chofer

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GpsSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result {
        val database = AppDatabase.getInstance(applicationContext)
        val dao = database.gpsSampleDao()

        // 1. Obtener muestras pendientes (máximo 200 eventos por lote según especificación)
        val pendingList = dao.getPendingSamples(200)
        if (pendingList.isEmpty()) {
            return Result.success()
        }

        val eventIds = pendingList.map { it.deviceEventId }

        // 2. Cargar token y configuración cifrada desde EncryptedSharedPreferences
        val (token, supabaseUrl, anonKey) = getSecureCredentials()
        if (token.isNullOrEmpty() || supabaseUrl.isNullOrEmpty()) {
            return Result.retry()
        }

        try {
            dao.markUploading(eventIds)

            // 3. Serializar JSON para la RPC ingest_gps_batch_v2
            val jsonArray = JSONArray()
            for (sample in pendingList) {
                val obj = JSONObject().apply {
                    put("device_event_id", sample.deviceEventId)
                    put("driver_id", sample.driverId)
                    put("device_id", sample.deviceId)
                    if (!sample.vehicleId.isNullOrEmpty()) put("vehicle_id", sample.vehicleId)
                    if (!sample.tripId.isNullOrEmpty()) put("trip_id", sample.tripId)
                    put("latitude", sample.latitude)
                    put("longitude", sample.longitude)
                    put("accuracy_meters", sample.accuracyMeters.toDouble())
                    put("speed_mps", sample.speedMps.toDouble())
                    sample.headingDegrees?.let { put("heading_degrees", it.toDouble()) }
                    sample.altitudeMeters?.let { put("altitude_meters", it) }
                    sample.batteryLevel?.let { put("battery_level", it) }
                    put("captured_at", sample.capturedAt)
                }
                jsonArray.put(obj)
            }

            val rpcPayload = JSONObject().apply {
                put("p_samples", jsonArray)
            }

            val body = rpcPayload.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("$supabaseUrl/rest/v1/rpc/ingest_gps_batch_v2")
                .addHeader("apikey", anonKey ?: "")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build()

            val response = httpClient.newCall(request).execute()
            if (response.isSuccessful) {
                // Servidor confirmó la ingesta
                dao.markConfirmed(eventIds)
                // Limpiar muestras confirmadas de más de 24 horas
                dao.cleanOldConfirmed(System.currentTimeMillis() - 86_400_000L)
                return Result.success()
            } else {
                dao.markFailed(eventIds)
                return Result.retry()
            }
        } catch (_e: Exception) {
            dao.markFailed(eventIds)
            return Result.retry()
        }
    }

    private fun getSecureCredentials(): Triple<String?, String?, String?> {
        return try {
            val masterKey = MasterKey.Builder(applicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            val prefs = EncryptedSharedPreferences.create(
                applicationContext,
                "tls_secure_driver_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )

            Triple(
                prefs.getString("auth_token", null),
                prefs.getString("supabase_url", null),
                prefs.getString("supabase_publishable_key", null)
            )
        } catch (_e: Exception) {
            Triple(null, null, null)
        }
    }
}
