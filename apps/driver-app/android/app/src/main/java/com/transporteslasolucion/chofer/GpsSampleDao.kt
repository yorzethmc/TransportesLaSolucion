package com.transporteslasolucion.chofer

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface GpsSampleDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertSample(sample: GpsSampleEntity): Long

    @Query("SELECT * FROM gps_samples WHERE sync_status IN ('pending', 'failed') ORDER BY captured_at ASC LIMIT :limit")
    suspend fun getPendingSamples(limit: Int = 200): List<GpsSampleEntity>

    @Query("UPDATE gps_samples SET sync_status = 'uploading' WHERE device_event_id IN (:eventIds)")
    suspend fun markUploading(eventIds: List<String>)

    @Query("UPDATE gps_samples SET sync_status = 'confirmed' WHERE device_event_id IN (:eventIds)")
    suspend fun markConfirmed(eventIds: List<String>)

    @Query("UPDATE gps_samples SET sync_status = 'failed', retry_count = retry_count + 1 WHERE device_event_id IN (:eventIds)")
    suspend fun markFailed(eventIds: List<String>)

    @Query("SELECT COUNT(*) FROM gps_samples WHERE sync_status IN ('pending', 'failed', 'uploading')")
    suspend fun getPendingCount(): Int

    @Query("DELETE FROM gps_samples WHERE sync_status = 'confirmed' AND created_at < :olderThanTimestamp")
    suspend fun cleanOldConfirmed(olderThanTimestamp: Long)
}
