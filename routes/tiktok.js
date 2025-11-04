const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const tiktokService = require('../services/tiktokService');
const jwt = require('jsonwebtoken');

// Middleware para verificar autenticación
const isAuthenticated = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Agregar perfil de TikTok para trackear
router.post('/add-profile', isAuthenticated, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    console.log(`📱 Buscando perfil de TikTok: @${username}`);

    // Obtener información del perfil desde la API de TikTok
    const userInfo = await tiktokService.getUserInfo(username);

    if (!userInfo.success) {
      return res.status(404).json({ error: userInfo.error || 'Profile not found' });
    }

    const connection = await pool.getConnection();

    try {
      // Verificar si ya existe este perfil para este usuario
      const [existing] = await connection.query(
        'SELECT id FROM tiktok_profiles WHERE user_id = ? AND tiktok_id = ?',
        [req.userId, userInfo.data.tiktok_id]
      );

      if (existing.length > 0) {
        connection.release();
        return res.status(400).json({ error: 'Profile already added' });
      }

      // Insertar el perfil en la base de datos
      const [result] = await connection.query(
        `INSERT INTO tiktok_profiles 
         (user_id, tiktok_id, tiktok_username, tiktok_nickname, avatar_url, 
          follower_count, following_count, video_count, heart_count, 
          is_verified, is_private, bio) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.userId,
          userInfo.data.tiktok_id,
          userInfo.data.username,
          userInfo.data.nickname,
          userInfo.data.avatar_url,
          userInfo.data.follower_count,
          userInfo.data.following_count,
          userInfo.data.video_count,
          userInfo.data.heart_count,
          userInfo.data.is_verified,
          userInfo.data.is_private,
          userInfo.data.bio
        ]
      );

      const profileId = result.insertId;

      // Obtener fecha actual en zona horaria de México (UTC-6)
      const now = new Date();
      const mexicoOffset = -6 * 60; // México está en UTC-6
      const mexicoTime = new Date(now.getTime() + (mexicoOffset + now.getTimezoneOffset()) * 60000);
      const formattedDate = mexicoTime.toISOString().split('T')[0]; // Formato: YYYY-MM-DD

      // Insertar estadísticas iniciales en el historial
      await connection.query(
        `INSERT INTO tiktok_stats_history 
         (profile_id, follower_count, following_count, video_count, heart_count, 
          follower_change, video_change, heart_change, recorded_at) 
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
        [
          profileId,
          userInfo.data.follower_count,
          userInfo.data.following_count,
          userInfo.data.video_count,
          userInfo.data.heart_count,
          formattedDate
        ]
      );

      connection.release();

      console.log(`✅ Perfil de TikTok agregado: @${username}`);

      res.json({
        message: 'Profile added successfully',
        profile: {
          id: profileId,
          ...userInfo.data
        }
      });
    } catch (error) {
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Error adding TikTok profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Obtener todos los perfiles trackeados del usuario
router.get('/profiles', isAuthenticated, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [profiles] = await connection.query(
      `SELECT id, tiktok_id, tiktok_username, tiktok_nickname, avatar_url,
              follower_count, following_count, video_count, heart_count,
              is_verified, is_private, bio, added_at, last_updated
       FROM tiktok_profiles 
       WHERE user_id = ?
       ORDER BY added_at DESC`,
      [req.userId]
    );

    connection.release();

    res.json({ profiles });
  } catch (error) {
    console.error('Error fetching TikTok profiles:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Obtener detalles de un perfil específico
router.get('/profile/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [profiles] = await connection.query(
      `SELECT * FROM tiktok_profiles 
       WHERE id = ? AND user_id = ?`,
      [id, req.userId]
    );

    if (profiles.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Profile not found' });
    }

    connection.release();

    res.json({ profile: profiles[0] });
  } catch (error) {
    console.error('Error fetching TikTok profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Obtener historial de estadísticas de un perfil
router.get('/profile/:id/history', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 14 } = req.query;

    const connection = await pool.getConnection();

    // Verificar que el perfil pertenece al usuario
    const [profiles] = await connection.query(
      'SELECT id FROM tiktok_profiles WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );

    if (profiles.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Obtener historial - traer todos los registros disponibles
    // El filtro de días es solo una referencia, pero siempre traemos lo que hay
    const [history] = await connection.query(
      `SELECT follower_count, following_count, video_count, heart_count,
              follower_change, video_change, heart_change, recorded_at
       FROM tiktok_stats_history
       WHERE profile_id = ?
       ORDER BY recorded_at DESC`,
      [id]
    );

    connection.release();

    res.json({ history });
  } catch (error) {
    console.error('Error fetching TikTok stats history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Eliminar perfil de TikTok
router.delete('/profile/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [result] = await connection.query(
      'DELETE FROM tiktok_profiles WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );

    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    console.log(`🗑️ Perfil de TikTok eliminado: ID ${id}`);

    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting TikTok profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Obtener notificaciones del usuario
router.get('/notifications', isAuthenticated, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [notifications] = await connection.query(
      `SELECT n.id, n.notification_type, n.message, n.is_read, n.created_at,
              p.tiktok_username, p.tiktok_nickname, p.avatar_url, p.id as profile_id
       FROM tiktok_notifications n
       JOIN tiktok_profiles p ON n.profile_id = p.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.userId]
    );

    connection.release();

    res.json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Contar notificaciones no leídas
router.get('/notifications/unread-count', isAuthenticated, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [result] = await connection.query(
      'SELECT COUNT(*) as count FROM tiktok_notifications WHERE user_id = ? AND is_read = FALSE',
      [req.userId]
    );

    connection.release();

    res.json({ unreadCount: result[0].count });
  } catch (error) {
    console.error('Error counting unread notifications:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Marcar notificación como leída
router.put('/notifications/:id/read', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.query(
      'UPDATE tiktok_notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, req.userId]
    );

    connection.release();

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Marcar todas las notificaciones como leídas
router.put('/notifications/read-all', isAuthenticated, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    await connection.query(
      'UPDATE tiktok_notifications SET is_read = TRUE WHERE user_id = ?',
      [req.userId]
    );

    connection.release();

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DEBUG: Ver últimos registros de historial (temporal)
router.get('/debug/history/:profileId', isAuthenticated, async (req, res) => {
  try {
    const { profileId } = req.params;
    const connection = await pool.getConnection();

    const [history] = await connection.query(
      `SELECT id, profile_id, follower_count, video_count, video_change, recorded_at, created_at
       FROM tiktok_stats_history
       WHERE profile_id = ?
       ORDER BY recorded_at DESC
       LIMIT 10`,
      [profileId]
    );

    connection.release();
    res.json({ history });
  } catch (error) {
    console.error('Error fetching debug history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// FIX: Recalcular video_change para registros existentes
router.post('/debug/fix-video-changes/:profileId', isAuthenticated, async (req, res) => {
  try {
    const { profileId } = req.params;
    const connection = await pool.getConnection();

    // Obtener todo el historial ordenado por fecha
    const [history] = await connection.query(
      `SELECT id, video_count, recorded_at
       FROM tiktok_stats_history
       WHERE profile_id = ?
       ORDER BY recorded_at ASC`,
      [profileId]
    );

    if (history.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'No history found' });
    }

    let fixed = 0;
    
    // Recalcular video_change para cada registro
    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const previous = i > 0 ? history[i - 1] : null;
      
      const correctChange = previous ? current.video_count - previous.video_count : 0;
      
      // Actualizar si es diferente
      await connection.query(
        `UPDATE tiktok_stats_history 
         SET video_change = ?
         WHERE id = ?`,
        [correctChange, current.id]
      );
      
      fixed++;
    }

    connection.release();
    
    res.json({ 
      message: 'Video changes recalculated', 
      recordsFixed: fixed 
    });
  } catch (error) {
    console.error('Error fixing video changes:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
