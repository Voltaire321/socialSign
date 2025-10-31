const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Función para inicializar las tablas
async function initializeTables() {
  try {
    const connection = await pool.getConnection();
    
    // Tabla de usuarios para Google OAuth
    await connection.query(`
      CREATE TABLE IF NOT EXISTS google_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        given_name VARCHAR(255),
        family_name VARCHAR(255),
        picture VARCHAR(500),
        locale VARCHAR(10),
        profile_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        INDEX idx_google_id (google_id),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabla de sesiones de usuarios
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES google_users(id) ON DELETE CASCADE,
        INDEX idx_token (token),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabla de perfiles de TikTok trackeados
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tiktok_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        tiktok_id VARCHAR(255) NOT NULL,
        tiktok_username VARCHAR(255) NOT NULL,
        tiktok_nickname VARCHAR(255),
        avatar_url VARCHAR(500),
        follower_count INT DEFAULT 0,
        following_count INT DEFAULT 0,
        video_count INT DEFAULT 0,
        heart_count BIGINT DEFAULT 0,
        is_verified BOOLEAN DEFAULT FALSE,
        is_private BOOLEAN DEFAULT FALSE,
        bio TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES google_users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_tiktok (user_id, tiktok_id),
        INDEX idx_user_id (user_id),
        INDEX idx_tiktok_id (tiktok_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabla de historial diario de estadísticas de TikTok
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tiktok_stats_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        profile_id INT NOT NULL,
        follower_count INT DEFAULT 0,
        following_count INT DEFAULT 0,
        video_count INT DEFAULT 0,
        heart_count BIGINT DEFAULT 0,
        follower_change INT DEFAULT 0,
        video_change INT DEFAULT 0,
        heart_change BIGINT DEFAULT 0,
        recorded_at DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES tiktok_profiles(id) ON DELETE CASCADE,
        UNIQUE KEY unique_profile_date (profile_id, recorded_at),
        INDEX idx_profile_id (profile_id),
        INDEX idx_recorded_at (recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Tabla de notificaciones de nuevos videos
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tiktok_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        profile_id INT NOT NULL,
        notification_type ENUM('new_video', 'milestone') DEFAULT 'new_video',
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES google_users(id) ON DELETE CASCADE,
        FOREIGN KEY (profile_id) REFERENCES tiktok_profiles(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_is_read (is_read),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✓ Tablas de base de datos inicializadas correctamente');
    connection.release();
  } catch (error) {
    console.error('Error al inicializar las tablas:', error);
    throw error;
  }
}

module.exports = { pool, initializeTables };
