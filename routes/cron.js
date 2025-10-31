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
  
  try {
    const connection = await pool.getConnection();
    
    // Obtener todos los perfiles activos
    const [profiles] = await connection.query(
      `SELECT p.*, u.id as user_id 
       FROM tiktok_profiles p
       JOIN google_users u ON p.user_id = u.id
       ORDER BY p.id`
    );

    console.log(`📊 Encontrados ${profiles.length} perfiles para actualizar`);

    let updatedCount = 0;
    let errorCount = 0;
    let newVideosCount = 0;

    for (const profile of profiles) {
      try {
        console.log(`🔍 Actualizando @${profile.tiktok_username}...`);

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

        // Obtener fecha actual en zona horaria de México
        const mexicoDate = new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
        const dateObj = new Date(mexicoDate);
        const formattedDate = dateObj.toISOString().split('T')[0]; // Formato: YYYY-MM-DD

        // Insertar o actualizar historial del día actual
        await connection.query(
          `INSERT INTO tiktok_stats_history 
           (profile_id, follower_count, following_count, video_count, heart_count, 
            follower_change, video_change, heart_change, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             follower_count = VALUES(follower_count),
             following_count = VALUES(following_count),
             video_count = VALUES(video_count),
             heart_count = VALUES(heart_count),
             follower_change = VALUES(follower_change),
             video_change = VALUES(video_change),
             heart_change = VALUES(heart_change)`,
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

        updatedCount++;
        console.log(`✅ @${profile.tiktok_username} actualizado correctamente`);

        // Pequeña pausa entre peticiones para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error actualizando @${profile.tiktok_username}:`, error.message);
        errorCount++;
      }
    }

    connection.release();

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

module.exports = router;
