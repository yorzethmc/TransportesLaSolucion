package com.transporteslasolucion.chofer

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "gps_samples",
    indices = [
        Index(value = ["device_event_id"], unique = true),
        Index(value = ["sync_status"])
    ]
)
data class GpsSampleEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "device_event_id")
    val deviceEventId: String,

    @ColumnInfo(name = "driver_id")
    val driverId: String,

    @ColumnInfo(name = "device_id")
    val deviceId: String,

    @ColumnInfo(name = "vehicle_id")
    val vehicleId: String?,

    @ColumnInfo(name = "trip_id")
    val tripId: String?,

    @ColumnInfo(name = "latitude")
    val latitude: Double,

    @ColumnInfo(name = "longitude")
    val longitude: Double,

    @ColumnInfo(name = "accuracy_meters")
    val accuracyMeters: Float,

    @ColumnInfo(name = "speed_mps")
    val speedMps: Float,

    @ColumnInfo(name = "heading_degrees")
    val headingDegrees: Float?,

    @ColumnInfo(name = "altitude_meters")
    val altitudeMeters: Double?,

    @ColumnInfo(name = "battery_level")
    val batteryLevel: Int?,

    @ColumnInfo(name = "captured_at")
    val capturedAt: String,

    @ColumnInfo(name = "sync_status")
    var syncStatus: String = "pending", // 'pending', 'uploading', 'confirmed', 'failed'

    @ColumnInfo(name = "retry_count")
    var retryCount: Int = 0,

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis()
)
