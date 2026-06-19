const axios = require('axios');

const KEY = process.env.INDEXNOW_KEY;
const SITE = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

async function notifyIndexNow(paths) {
  if (!KEY || !SITE || process.env.NODE_ENV !== 'production') return;

  const urls = (Array.isArray(paths) ? paths : [paths]).map(p => `${SITE}${p}`);

  try {
    await axios.post(
      'https://api.indexnow.org/indexnow',
      {
        host: new URL(SITE).hostname,
        key: KEY,
        keyLocation: `${SITE}/${KEY}.txt`,
        urlList: urls,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    console.log(`[IndexNow] notified ${urls.length} URL(s)`);
  } catch (e) {
    console.warn('[IndexNow] notification failed:', e.message);
  }
}

module.exports = { notifyIndexNow };
