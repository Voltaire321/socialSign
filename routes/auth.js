const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
require('dotenv').config();

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

// Ruta para iniciar autenticación con Google
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  })
);

// Callback de Google OAuth
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    session: false 
  }),
  async (req, res) => {
    try {
      // Generar JWT
      const token = jwt.sign(
        { 
          userId: req.user.id,
          email: req.user.email 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Guardar sesión en la base de datos
      const connection = await pool.getConnection();
      await connection.query(
        `INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at) 
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
        [
          req.user.id,
          token,
          req.ip,
          req.headers['user-agent']
        ]
      );
      connection.release();

      // Redirigir al frontend con el token
      res.redirect(`${process.env.FRONTEND_URL}/auth-callback?token=${token}`);
    } catch (error) {
      console.error('Error en callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=callback_failed`);
    }
  }
);

// Obtener información del usuario autenticado
router.get('/user', isAuthenticated, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [users] = await connection.query(
      `SELECT id, google_id, email, name, given_name, family_name, 
              picture, locale, profile_completed, created_at, last_login 
       FROM google_users WHERE id = ?`,
      [req.userId]
    );
    connection.release();

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    console.log('👤 Enviando datos del usuario al frontend:', users[0]);
    res.json(users[0]);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar perfil del usuario
router.put('/user/profile', isAuthenticated, async (req, res) => {
  try {
    const { name, given_name, family_name } = req.body;
    const connection = await pool.getConnection();
    
    await connection.query(
      `UPDATE google_users 
       SET name = ?, given_name = ?, family_name = ?, profile_completed = TRUE 
       WHERE id = ?`,
      [name, given_name, family_name, req.userId]
    );

    const [updatedUser] = await connection.query(
      `SELECT id, google_id, email, name, given_name, family_name, 
              picture, locale, profile_completed, created_at, last_login 
       FROM google_users WHERE id = ?`,
      [req.userId]
    );

    connection.release();
    res.json(updatedUser[0]);
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cerrar sesión
router.post('/logout', isAuthenticated, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const connection = await pool.getConnection();
    
    // Eliminar token de la base de datos
    await connection.query(
      'DELETE FROM user_sessions WHERE token = ?',
      [token]
    );
    
    connection.release();
    res.json({ message: 'Sesión cerrada exitosamente' });
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Verificar si el token es válido
router.get('/verify', isAuthenticated, (req, res) => {
  res.json({ valid: true, userId: req.userId });
});

module.exports = router;
