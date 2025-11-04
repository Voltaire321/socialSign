const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const tiktokService = require('../services/tiktokService');

// Endpoint para actualizar todos los perfiles de TikTok (llamado por Render Cron)
router.post('/update-tiktok-profiles', async (req, res) => {
  // Verificar que la petición viene de Render Cron (opcional pero recomendado)
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    console.log('⚠️ Intento de acceso no autorizado al cron job');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🔄 Iniciando actualización programada de perfiles de TikTok...');
  
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    // Obtener todos los perfiles activos
    const [profiles] = await connection.query(
      `SELECT p.*, u.id as user_id 
       FROM tiktok_profiles p
       JOIN google_users u ON p.user_id = u.id
       ORDER BY p.id`
    );

    console.log(`📊 Encontrados ${profiles.length} perfiles para actualizar`);

    // Obtener fecha actual en zona horaria de México (UTC-6) una sola vez
    const now = new Date();
    const mexicoOffset = -6 * 60;
    const mexicoTime = new Date(now.getTime() + (mexicoOffset + now.getTimezoneOffset()) * 60000);
    const formattedDate = mexicoTime.toISOString().split('T')[0];

    // Obtener registros existentes de hoy para todos los perfiles (batch query)
    const profileIds = profiles.map(p => p.id);
    const [existingRecords] = await connection.query(
      `SELECT profile_id, follower_change, video_change, heart_change 
       FROM tiktok_stats_history 
       WHERE profile_id IN (?) AND recorded_at = ?`,
      [profileIds, formattedDate]
    );

    // Crear un mapa para acceso rápido
    const existingRecordsMap = new Map();
    existingRecords.forEach(record => {
      existingRecordsMap.set(record.profile_id, record);
    });

    let updatedCount = 0;
    let errorCount = 0;
    let newVideosCount = 0;

    for (const profile of profiles) {
      try {
        console.log(`\n🔍 [${new Date().toISOString()}] Actualizando @${profile.tiktok_username}...`);

        // Obtener datos actuales desde TikTok API
        const userInfo = await tiktokService.getUserInfo(profile.tiktok_username);

        if (!userInfo.success) {
          console.error(`❌ Error obteniendo datos de @${profile.tiktok_username}:`, userInfo.error);
          errorCount++;
          continue;
        }

        const currentData = userInfo.data;
        
        // Calcular cambios
        const followerChange = currentData.follower_count - profile.follower_count;
        const videoChange = currentData.video_count - profile.video_count;
        const heartChange = currentData.heart_count - profile.heart_count;

        // Detectar nuevos videos
        if (videoChange > 0) {
          console.log(`🎬 @${profile.tiktok_username} subió ${videoChange} nuevo(s) video(s)!`);
          newVideosCount++;

          // Crear notificación
          const message = videoChange === 1 
            ? 'uploaded a new video' 
            : `uploaded ${videoChange} new videos`;

          await connection.query(
            `INSERT INTO tiktok_notifications 
             (user_id, profile_id, notification_type, message, is_read) 
             VALUES (?, ?, 'new_video', ?, FALSE)`,
            [profile.user_id, profile.id, message]
          );
        }

        // Actualizar perfil con datos actuales
        await connection.query(
          `UPDATE tiktok_profiles 
           SET follower_count = ?, 
               following_count = ?, 
               video_count = ?, 
               heart_count = ?,
               avatar_url = ?,
               bio = ?,
               is_verified = ?,
               is_private = ?,
               last_updated = NOW()
           WHERE id = ?`,
          [
            currentData.follower_count,
            currentData.following_count,
            currentData.video_count,
            currentData.heart_count,
            currentData.avatar_url,
            currentData.bio,
            currentData.is_verified,
            currentData.is_private,
            profile.id
          ]
        );

        // Verificar si ya existe un registro para hoy (usando el mapa precargado)
        const existingRecord = existingRecordsMap.get(profile.id);

        // Si ya existe registro de hoy, preservar los cambios originales y solo actualizar contadores
        if (existingRecord) {
          await connection.query(
            `UPDATE tiktok_stats_history 
             SET follower_count = ?,
                 following_count = ?,
                 video_count = ?,
                 heart_count = ?
             WHERE profile_id = ? AND recorded_at = ?`,
            [
              currentData.follower_count,
              currentData.following_count,
              currentData.video_count,
              currentData.heart_count,
              profile.id,
              formattedDate
            ]
          );
          console.log(`🔄 Actualizado (registro existente): @${profile.tiktok_username}`);
        } else {
          // Primer registro del día, insertar con cambios calculados
          await connection.query(
            `INSERT INTO tiktok_stats_history 
             (profile_id, follower_count, following_count, video_count, heart_count, 
              follower_change, video_change, heart_change, recorded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              profile.id,
              currentData.follower_count,
              currentData.following_count,
              currentData.video_count,
              currentData.heart_count,
              followerChange,
              videoChange,
              heartChange,
              formattedDate
            ]
          );
          console.log(`✅ Insertado (primer registro): @${profile.tiktok_username}`);
        }

        updatedCount++;

        // Pequeña pausa entre peticiones para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 800));

      } catch (error) {
        console.error(`❌ Error actualizando @${profile.tiktok_username}:`, error.message);
        errorCount++;
      }
    }

    connection.release();
    connection = null;

    const summary = {
      total: profiles.length,
      updated: updatedCount,
      errors: errorCount,
      newVideos: newVideosCount,
      timestamp: new Date().toISOString()
    };

    console.log('✅ Actualización completada:', summary);

    res.json({
      success: true,
      message: 'TikTok profiles updated successfully',
      summary
    });

  } catch (error) {
    console.error('❌ Error en actualización programada:', error);
    if (connection) {
      connection.release();
    }
    res.status(500).json({ 
      success: false,
      error: 'Failed to update profiles',
      details: error.message 
    });
  }
});

// Endpoint de salud para verificar que el cron está funcionando
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'cron-jobs',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para ver estadísticas de uso de API (solo para desarrollo)
router.get('/api-stats', async (req, res) => {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tiktokService = require('../services/tiktokService');
    const cacheStats = tiktokService.getCacheStats ? tiktokService.getCacheStats() : null;
    
    res.json({
      message: 'API usage statistics',
      cache: cacheStats || 'Cache stats not available',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
