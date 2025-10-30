const axios = require('axios');

const RAPIDAPI_KEY = '4759dae0ebmshaed88115880926ap18abebjsn668e4e8043c2';
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const BASE_URL = 'https://tiktok-api23.p.rapidapi.com/api';

// Obtener información del usuario de TikTok
async function getUserInfo(username) {
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

    const response = await axios.request(options);
    
    if (response.data && response.data.userInfo) {
      const { user, stats } = response.data.userInfo;
      
      return {
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

module.exports = {
  getUserInfo,
  getUserPosts
};
