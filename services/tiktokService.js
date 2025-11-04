const axios = require('axios');

const RAPIDAPI_KEY = '261b313806mshf2c91b12bdec53bp1aaee4jsna4f3f86b0111';
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const BASE_URL = 'https://tiktok-api23.p.rapidapi.com/api';

// Sistema de caché simple para evitar peticiones duplicadas
const cache = new Map();
const CACHE_DURATION = 60000; // 60 segundos

// Limpiar caché periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
    }
  }
}, 30000); // Limpiar cada 30 segundos

// Obtener información del usuario de TikTok
async function getUserInfo(username) {
  // Verificar caché
  const cacheKey = `userinfo:${username.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log(`✅ Cache hit para @${username}`);
    return cached.data;
  }
  try {
    const options = {
      method: 'GET',
      url: `${BASE_URL}/user/info`,
      params: { uniqueId: username },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    };

    console.log(`🌐 API call para @${username}`);
    const response = await axios.request(options);
    
    if (response.data && response.data.userInfo) {
      const { user, stats } = response.data.userInfo;
      
      const result = {
        success: true,
        data: {
          tiktok_id: user.id,
          username: user.uniqueId,
          nickname: user.nickname,
          avatar_url: user.avatarLarger || user.avatarMedium || user.avatarThumb,
          follower_count: parseInt(stats.followerCount) || 0,
          following_count: parseInt(stats.followingCount) || 0,
          video_count: parseInt(stats.videoCount) || 0,
          heart_count: parseInt(stats.heartCount) || 0,
          is_verified: user.verified || false,
          is_private: user.secret || false,
          bio: user.signature || ''
        }
      };

      // Guardar en caché
      cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;
    } else {
      return {
        success: false,
        error: 'User not found or invalid response'
      };
    }
  } catch (error) {
    console.error('Error fetching TikTok user info:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Obtener videos del usuario
async function getUserPosts(username, maxCursor = 0, count = 10) {
  try {
    const options = {
      method: 'GET',
      url: `${BASE_URL}/user/posts`,
      params: { 
        uniqueId: username,
        count: count,
        cursor: maxCursor
      },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    };

    const response = await axios.request(options);
    
    if (response.data && response.data.itemList) {
      return {
        success: true,
        data: {
          videos: response.data.itemList,
          hasMore: response.data.hasMore,
          cursor: response.data.cursor
        }
      };
    } else {
      return {
        success: false,
        error: 'No posts found'
      };
    }
  } catch (error) {
    console.error('Error fetching TikTok user posts:', error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// Función para obtener estadísticas de caché
function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.entries()).map(([key, value]) => ({
      key,
      age: Date.now() - value.timestamp,
      expired: (Date.now() - value.timestamp) > CACHE_DURATION
    }))
  };
}

module.exports = {
  getUserInfo,
  getUserPosts,
  getCacheStats
};
