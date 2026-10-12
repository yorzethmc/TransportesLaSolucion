package com.transporteslasolucion.chofer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class GpsForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback

    private var driverId: String = ""
    private var deviceId: String = ""
    private var vehicleId: String? = null
    private var tripId: String? = null

    companion object {
        const val CHANNEL_ID = "TLS_GPS_TRACKING_CHANNEL"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "ACTION_START_TRACKING"
        const val ACTION_STOP = "ACTION_STOP_TRACKING"
        var isServiceRunning = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        createNotificationChannel()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation ?: return
                handleNewLocation(location)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        when (intent.action) {
            ACTION_START -> {
                driverId = intent.getStringExtra("driver_id") ?: ""
                deviceId = intent.getStringExtra("device_id") ?: ""
                vehicleId = intent.getStringExtra("vehicle_id")
                tripId = intent.getStringExtra("trip_id")

                val notification = buildNotification("Turno activo - Transmitiendo ubicación satelital cada 5 min")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }

                startLocationUpdates()
                isServiceRunning = true
            }
            ACTION_STOP -> {
                stopLocationUpdates()
                stopForeground(true)
                stopSelf()
                isServiceRunning = false
            }
        }

        return START_STICKY
    }

    private fun startLocationUpdates() {
        // Intervalo de 5 minutos (300,000 ms) según especificaciones de negocio
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 300_000L)
            .setMinUpdateIntervalMillis(120_000L)
            .setMaxUpdateDelayMillis(360_000L)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
        } catch (_e: SecurityException) {
            // Permiso no otorgado
        }
    }

    private fun stopLocationUpdates() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

    private fun handleNewLocation(location: Location) {
        val batteryLevel = getBatteryLevel()
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val capturedAt = isoFormat.format(Date(location.time))
        val deviceEventId = "EVT_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(8)}"

        val sample = GpsSampleEntity(
            deviceEventId = deviceEventId,
            driverId = driverId,
            deviceId = deviceId,
            vehicleId = vehicleId,
            tripId = tripId,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy,
            speedMps = location.speed,
            headingDegrees = if (location.hasBearing()) location.bearing else null,
            altitudeMeters = if (location.hasAltitude()) location.altitude else null,
            batteryLevel = batteryLevel,
            capturedAt = capturedAt,
            syncStatus = "pending"
        )

        // Escribir DIRECTAMENTE en Room SQLite nativo (seguro con pantalla apagada)
        serviceScope.launch {
            val database = AppDatabase.getInstance(applicationContext)
            database.gpsSampleDao().insertSample(sample)

            // Disparar sincronización con WorkManager cuando haya red disponible
            val syncRequest = OneTimeWorkRequestBuilder<GpsSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            WorkManager.getInstance(applicationContext).enqueue(syncRequest)
        }
    }

    private fun getBatteryLevel(): Int? {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        return bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun buildNotification(contentText: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Transportes La Solución")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Seguimiento GPS de Flota",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notificación persistente requerida para el seguimiento GPS en turno activo"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopLocationUpdates()
        isServiceRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
