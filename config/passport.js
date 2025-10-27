const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./database');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('📸 Datos del perfil de Google:', {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails[0]?.value,
        picture: profile.photos[0]?.value
      });

      const connection = await pool.getConnection();
      
      // Buscar si el usuario ya existe
      const [existingUsers] = await connection.query(
        'SELECT * FROM google_users WHERE google_id = ?',
        [profile.id]
      );

      if (existingUsers.length > 0) {
        // Usuario existente, actualizar último login
        await connection.query(
          'UPDATE google_users SET last_login = NOW(), picture = ?, name = ? WHERE google_id = ?',
          [profile.photos[0]?.value, profile.displayName, profile.id]
        );
        connection.release();
        return done(null, existingUsers[0]);
      }

      // Nuevo usuario, crear registro
      const [result] = await connection.query(
        `INSERT INTO google_users 
        (google_id, email, name, given_name, family_name, picture, locale, last_login) 
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          profile.id,
          profile.emails[0]?.value,
          profile.displayName,
          profile.name?.givenName,
          profile.name?.familyName,
          profile.photos[0]?.value,
          profile._json.locale
        ]
      );

      const [newUser] = await connection.query(
        'SELECT * FROM google_users WHERE id = ?',
        [result.insertId]
      );

      connection.release();
      return done(null, newUser[0]);
    } catch (error) {
      console.error('Error en Google Strategy:', error);
      return done(error, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const connection = await pool.getConnection();
    const [users] = await connection.query(
      'SELECT * FROM google_users WHERE id = ?',
      [id]
    );
    connection.release();
    done(null, users[0]);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
