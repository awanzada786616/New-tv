const axios = require('axios');
const CryptoJS = require('crypto-js');

// --- CONFIG ---
const API_V5 = "https://web.jazztv.pk/alpha/api_gateway/v5/web/";
const API_V3 = "https://web.jazztv.pk/alpha/api_gateway/v3/web/";
const PHP_API = "https://jazztv.pk/alpha/api_gateway/index.php/media/";

// --- FIXED DECRYPTION FOR NODE.JS ---
function decrypt(text) {
    if (!text) return null;
    try {
        const keyStr = "gTOwkDMjlDZ0EjY58GcsVWM4oGOllnd4VzN3UmZsBHc";
        const reversed = keyStr.split("").reverse().join("");
        
        // FIX: 'atob' ki jagah Buffer use kiya hai jo Vercel par chalta hai
        const key = Buffer.from(reversed, 'base64').toString('utf-8');
        
        const iv = CryptoJS.enc.Utf8.parse("fpmjlrbhpljoennm");
        const ct = CryptoJS.enc.Hex.parse(text);
        const decrypted = CryptoJS.AES.decrypt({ ciphertext: ct }, CryptoJS.enc.Utf8.parse(key), { iv: iv });
        return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
    } catch (e) {
        console.error("Decryption Error:", e.message);
        return null;
    }
}

// Token Cache
let cachedToken = null;

async function getToken() {
    if (cachedToken) return cachedToken;
    try {
        const devId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });

        // Headers add kiye taaki server block na kare
        const res = await axios.post(`${API_V5}auth/guest-login`, 
            { device_id: devId, platform: "web" },
            { headers: { 'User-Agent': 'Mozilla/5.0', 'X-Forwarded-For': '119.153.0.0' } } 
        );

        const data = decrypt(res.data.eData);
        if (data && data.access_token) {
            cachedToken = data.access_token;
            return data.access_token;
        }
    } catch (e) { 
        console.error("Token Error:", e.message);
        return null; 
    }
}

module.exports = async (req, res) => {
    const { action, slug } = req.query;
    
    // Allow CORS (Taki browser error na de)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const token = await getToken();
    if (!token) return res.status(500).json({ error: "Token Generation Failed" });

    // 1. GET CHANNELS
    if (action === 'channels') {
        try {
            // Headers added for Geo-location trick
            const headers = { Authorization: `Bearer ${token}`, 'X-Forwarded-For': '119.153.0.0' };
            
            let apiRes = await axios.post(`${API_V3}live-tv`, { project_id: "2", platform: "web" }, { headers });
            let data = decrypt(apiRes.data.eData);
            let list = data?.data?.channels || [];

            if (!list.length) {
                 apiRes = await axios.post(`${API_V5}genre-programs-carousal`, { genre_slug: 'live-tv', project_id: "2", platform: "web" }, { headers });
                 data = decrypt(apiRes.data.eData);
                 list = data?.data?.programData || [];
            }
            
            const channels = list.map(c => ({
                name: c.name || c.channelName || c.title,
                logo: c.logo || c.image || c.portrait_poster,
                slug: c.slug || c.channelSlug,
                id: c.id
            }));
            
            return res.status(200).json(channels);
        } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // 2. GET LINK
    if (action === 'play' && slug) {
        try {
            const apiRes = await axios.post(`${PHP_API}get-channel-url`, {
                slug: slug, type: "channel", user_id: "0", mobile: "0", phone_details: "Web"
            });
            const data = decrypt(apiRes.data.eData);
            const url = data?.data?.ChannelStreamingUrls || data?.data?.HlsUrl || "";
            return res.status(200).json({ url });
        } catch (e) { return res.status(500).json({ error: "Link Error" }); }
    }

    return res.json({ msg: "JazzTV Auto-Proxy is Running!" });
};
