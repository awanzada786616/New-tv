const axios = require('axios');
const CryptoJS = require('crypto-js');

// --- CONFIG ---
const API_V5 = "https://web.jazztv.pk/alpha/api_gateway/v5/web/";
const API_V3 = "https://web.jazztv.pk/alpha/api_gateway/v3/web/";
const PHP_API = "https://jazztv.pk/alpha/api_gateway/index.php/media/";

// Decryption Logic
function decrypt(text) {
    if (!text) return null;
    const key = "gTOwkDMjlDZ0EjY58GcsVWM4oGOllnd4VzN3UmZsBHc".split("").reverse().join("");
    const iv = CryptoJS.enc.Utf8.parse("fpmjlrbhpljoennm");
    const ct = CryptoJS.enc.Hex.parse(text);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: ct }, CryptoJS.enc.Utf8.parse(atob(key)), { iv: iv });
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

// Token Cache (Temporary)
let cachedToken = null;

async function getToken() {
    if (cachedToken) return cachedToken;
    try {
        // Fake Device ID
        const devId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });

        const res = await axios.post(`${API_V5}auth/guest-login`, { device_id: devId, platform: "web" });
        const data = decrypt(res.data.eData);
        if (data && data.access_token) {
            cachedToken = data.access_token;
            return data.access_token;
        }
    } catch (e) { return null; }
}

module.exports = async (req, res) => {
    const { action, slug } = req.query;
    const token = await getToken();

    if (!token) return res.status(500).json({ error: "Token Failed" });

    // 1. GET CHANNELS
    if (action === 'channels') {
        try {
            // Try V3 first
            let apiRes = await axios.post(`${API_V3}live-tv`, { project_id: "2", platform: "web" }, { headers: { Authorization: `Bearer ${token}` } });
            let data = decrypt(apiRes.data.eData);
            let list = data?.data?.channels || [];

            // Fallback to V5
            if (!list.length) {
                 apiRes = await axios.post(`${API_V5}genre-programs-carousal`, { genre_slug: 'live-tv', project_id: "2", platform: "web" }, { headers: { Authorization: `Bearer ${token}` } });
                 data = decrypt(apiRes.data.eData);
                 list = data?.data?.programData || [];
            }
            
            // Clean Data
            const channels = list.map(c => ({
                name: c.name || c.channelName || c.title,
                logo: c.logo || c.image || c.portrait_poster,
                slug: c.slug || c.channelSlug,
                id: c.id
            }));
            
            return res.json(channels);
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
            return res.json({ url });
        } catch (e) { return res.status(500).json({ error: "Link Error" }); }
    }

    return res.json({ msg: "JazzTV Auto-Proxy is Running!" });
};
