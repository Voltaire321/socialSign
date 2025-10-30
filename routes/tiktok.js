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

      // Insertar estadísticas iniciales en el historial
      await connection.query(
        `INSERT INTO tiktok_stats_history 
         (profile_id, follower_count, following_count, video_count, heart_count, 
          follower_change, video_change, heart_change, recorded_at) 
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, CURDATE())`,
        [
          profileId,
          userInfo.data.follower_count,
          userInfo.data.following_count,
          userInfo.data.video_count,
          userInfo.data.heart_count
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

    // Obtener historial
    const [history] = await connection.query(
      `SELECT follower_count, following_count, video_count, heart_count,
              follower_change, video_change, heart_change, recorded_at
       FROM tiktok_stats_history
       WHERE profile_id = ?
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [id, parseInt(days)]
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

module.exports = router;
