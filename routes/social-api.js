const express = require('express');
const router = express.Router();

// ============================================
// Social Media API - Datos reales via APIs
// ============================================

// GET /api/social/facebook/:pageId - Fetch real Facebook page data
router.get('/facebook/:pageId', async (req, res) => {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
        return res.status(400).json({
            error: 'Configura META_APP_ID y META_APP_SECRET en .env',
            help: 'Crea una app en https://developers.facebook.com/apps/'
        });
    }

    const pageId = req.params.pageId.trim();
    const accessToken = `${appId}|${appSecret}`;

    try {
        const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}?fields=name,fan_count,followers_count,about,picture.width(200),link,category,website&access_token=${accessToken}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (!resp.ok || data.error) {
            throw new Error(data?.error?.message || 'No se pudo obtener datos de Facebook');
        }

        res.json({
            source: 'facebook',
            id: data.id,
            nombre: data.name || '',
            seguidores: data.followers_count || data.fan_count || 0,
            likes: data.fan_count || 0,
            foto: data.picture?.data?.url || '',
            categoria: data.category || '',
            descripcion: data.about || '',
            website: data.website || '',
            link: data.link || `https://facebook.com/${pageId}`
        });
    } catch (error) {
        console.error('Facebook API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/social/instagram/:username - Fetch Instagram via Meta Graph API
// Requires: Instagram Business Account linked to Facebook Page + User Access Token
router.get('/instagram/:username', async (req, res) => {
    const token = process.env.META_USER_TOKEN;

    if (!token) {
        return res.status(400).json({
            error: 'Configura META_USER_TOKEN en .env para Instagram',
            help: 'Necesitas un User Access Token con permisos instagram_basic, pages_show_list'
        });
    }

    const username = req.params.username.trim().replace('@', '');

    try {
        // Search for Instagram Business Account by username
        const searchUrl = `https://graph.facebook.com/v21.0/ig_hashtag_search?q=${encodeURIComponent(username)}&access_token=${token}`;

        // Alternative: use the business discovery endpoint
        // First get the user's Instagram Business Account ID
        const accountsResp = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`);
        const accountsData = await accountsResp.json();

        if (!accountsResp.ok || !accountsData.data?.length) {
            throw new Error('No se encontraron paginas de Facebook vinculadas');
        }

        // Get the Instagram Business Account ID from the first page
        const pageId = accountsData.data[0].id;
        const pageToken = accountsData.data[0].access_token;

        const igUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`;
        const igResp = await fetch(igUrl);
        const igData = await igResp.json();

        if (!igData.instagram_business_account) {
            throw new Error('No hay cuenta de Instagram Business vinculada a esta pagina');
        }

        const igId = igData.instagram_business_account.id;

        // Use Business Discovery to get any public Instagram Business account
        const discoveryUrl = `https://graph.facebook.com/v21.0/${igId}?fields=business_discovery.fields(username,name,biography,followers_count,follows_count,media_count,profile_picture_url,media.limit(3){caption,like_count,comments_count,timestamp,media_type,thumbnail_url,media_url}).username(${encodeURIComponent(username)})&access_token=${pageToken}`;

        const discoveryResp = await fetch(discoveryUrl);
        const discoveryData = await discoveryResp.json();

        if (!discoveryResp.ok || discoveryData.error) {
            throw new Error(discoveryData?.error?.message || 'No se pudo obtener datos de Instagram');
        }

        const bd = discoveryData.business_discovery;
        const posts = (bd.media?.data || []).slice(0, 3).map(m => ({
            caption: (m.caption || '').substring(0, 100),
            likes: m.like_count || 0,
            comments: m.comments_count || 0,
            fecha: m.timestamp,
            tipo: m.media_type,
            imagen: m.thumbnail_url || m.media_url || ''
        }));

        res.json({
            source: 'instagram',
            username: bd.username,
            nombre: bd.name || bd.username,
            seguidores: bd.followers_count || 0,
            siguiendo: bd.follows_count || 0,
            publicaciones: bd.media_count || 0,
            foto: bd.profile_picture_url || '',
            bio: bd.biography || '',
            ultimos_posts: posts
        });
    } catch (error) {
        console.error('Instagram API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/social/tiktok/:username - Fetch TikTok profile
// Uses TikTok Display API or Research API
router.get('/tiktok/:username', async (req, res) => {
    const token = process.env.TIKTOK_ACCESS_TOKEN;

    if (!token) {
        return res.status(400).json({
            error: 'Configura TIKTOK_ACCESS_TOKEN en .env',
            help: 'Crea una app en https://developers.tiktok.com/'
        });
    }

    const username = req.params.username.trim().replace('@', '');

    try {
        const url = 'https://open.tiktokapis.com/v2/research/user/info/';
        const resp = await fetch(url + '?' + new URLSearchParams({
            fields: 'display_name,follower_count,following_count,likes_count,video_count,avatar_url,bio_description,is_verified'
        }), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username })
        });

        const data = await resp.json();

        if (!resp.ok || data.error) {
            throw new Error(data?.error?.message || 'No se pudo obtener datos de TikTok');
        }

        const user = data.data || {};
        res.json({
            source: 'tiktok',
            username: username,
            nombre: user.display_name || username,
            seguidores: user.follower_count || 0,
            siguiendo: user.following_count || 0,
            likes: user.likes_count || 0,
            videos: user.video_count || 0,
            foto: user.avatar_url || '',
            bio: user.bio_description || '',
            verificado: user.is_verified || false
        });
    } catch (error) {
        console.error('TikTok API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
