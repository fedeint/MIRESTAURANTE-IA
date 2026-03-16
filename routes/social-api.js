const express = require('express');
const router = express.Router();

// ============================================
// Social Media API - Datos reales via Meta SDK
// ============================================

const API_VERSION = 'v22.0';
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;

function getAppToken() {
    const id = process.env.META_APP_ID;
    const secret = process.env.META_APP_SECRET;
    if (!id || !secret) return null;
    return `${id}|${secret}`;
}

// Helper: fetch from Graph API
async function graphGet(path, token, params = {}) {
    const qs = new URLSearchParams({ access_token: token, ...params });
    const url = `${GRAPH_URL}/${path}?${qs}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok || data.error) {
        throw new Error(data?.error?.message || `Graph API error ${resp.status}`);
    }
    return data;
}

// =============================================
// FACEBOOK PAGE - Public data with App Token
// =============================================
router.get('/facebook/:pageId', async (req, res) => {
    const token = getAppToken();
    if (!token) {
        return res.status(400).json({
            error: 'Configura META_APP_ID y META_APP_SECRET en .env',
            help: 'Crea una app en https://developers.facebook.com/apps/ → Configuracion → Basica'
        });
    }

    try {
        const pageId = req.params.pageId.trim();
        const data = await graphGet(pageId, token, {
            fields: 'name,fan_count,followers_count,about,picture.width(200),link,category,website,posts.limit(3){message,created_time,likes.summary(true),comments.summary(true)}'
        });

        const posts = (data.posts?.data || []).map(p => ({
            mensaje: (p.message || '').substring(0, 120),
            fecha: p.created_time,
            likes: p.likes?.summary?.total_count || 0,
            comentarios: p.comments?.summary?.total_count || 0
        }));

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
            link: data.link || `https://facebook.com/${pageId}`,
            ultimos_posts: posts
        });
    } catch (error) {
        console.error('Facebook API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// INSTAGRAM - Business Discovery (3rd party)
// Puede ver CUALQUIER cuenta Business/Creator publica
// =============================================
router.get('/instagram/:username', async (req, res) => {
    const userToken = process.env.META_USER_TOKEN;
    if (!userToken) {
        return res.status(400).json({
            error: 'Configura META_USER_TOKEN en .env',
            help: '1) Crea app en developers.facebook.com\n2) Agrega producto "Instagram Graph API"\n3) En Graph API Explorer genera token con permisos: instagram_basic, pages_show_list, business_management\n4) Copia el token a .env como META_USER_TOKEN'
        });
    }

    const username = req.params.username.trim().replace('@', '');

    try {
        // Step 1: Get my pages to find my IG Business Account ID
        const accounts = await graphGet('me/accounts', userToken);
        if (!accounts.data?.length) throw new Error('No tienes paginas de Facebook vinculadas');

        const pageId = accounts.data[0].id;
        const pageToken = accounts.data[0].access_token || userToken;

        // Step 2: Get my IG Business Account
        const pageData = await graphGet(pageId, pageToken, { fields: 'instagram_business_account' });
        if (!pageData.instagram_business_account) {
            throw new Error('Tu pagina de Facebook no tiene cuenta de Instagram Business vinculada. Ve a la configuracion de tu pagina de Facebook → Instagram → Conectar cuenta.');
        }

        const myIgId = pageData.instagram_business_account.id;

        // Step 3: Business Discovery - query ANY public business/creator account
        const bd = await graphGet(myIgId, pageToken, {
            fields: `business_discovery.fields(username,name,biography,followers_count,follows_count,media_count,profile_picture_url,media.limit(3){caption,like_count,comments_count,timestamp,media_type,thumbnail_url,media_url}).username(${username})`
        });

        const profile = bd.business_discovery;
        const posts = (profile.media?.data || []).slice(0, 3).map(m => ({
            caption: (m.caption || '').substring(0, 120),
            likes: m.like_count || 0,
            comments: m.comments_count || 0,
            fecha: m.timestamp,
            tipo: m.media_type,
            imagen: m.thumbnail_url || m.media_url || ''
        }));

        // Calculate avg engagement
        const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
        const totalComments = posts.reduce((s, p) => s + p.comments, 0);
        const avgEngagement = posts.length > 0 ? Math.round((totalLikes + totalComments) / posts.length) : 0;

        res.json({
            source: 'instagram',
            username: profile.username,
            nombre: profile.name || profile.username,
            seguidores: profile.followers_count || 0,
            siguiendo: profile.follows_count || 0,
            publicaciones: profile.media_count || 0,
            foto: profile.profile_picture_url || '',
            bio: profile.biography || '',
            engagement_promedio: avgEngagement,
            ultimos_posts: posts
        });
    } catch (error) {
        console.error('Instagram API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// META AD LIBRARY - Ver anuncios de competencia
// Publico, solo necesita App Token
// =============================================
router.get('/ads/:pageId', async (req, res) => {
    const token = getAppToken();
    if (!token) {
        return res.status(400).json({ error: 'Configura META_APP_ID y META_APP_SECRET en .env' });
    }

    try {
        const pageId = req.params.pageId.trim();
        const country = req.query.country || 'PE'; // Peru por defecto

        const qs = new URLSearchParams({
            access_token: token,
            ad_reached_countries: `["${country}"]`,
            search_page_ids: pageId,
            ad_active_status: 'ALL',
            fields: 'ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,page_name,spend,impressions,ad_snapshot_url',
            limit: '10'
        });

        const url = `${GRAPH_URL}/ads_archive?${qs}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (!resp.ok || data.error) {
            throw new Error(data?.error?.message || 'No se pudo consultar Ad Library');
        }

        const anuncios = (data.data || []).map(ad => ({
            pagina: ad.page_name || '',
            texto: (ad.ad_creative_bodies || []).join(' ').substring(0, 200),
            titulo: (ad.ad_creative_link_titles || []).join(' ').substring(0, 100),
            inicio: ad.ad_delivery_start_time || '',
            fin: ad.ad_delivery_stop_time || 'Activo',
            snapshot_url: ad.ad_snapshot_url || '',
            gasto: ad.spend || null,
            impresiones: ad.impressions || null
        }));

        res.json({
            source: 'ad_library',
            page_id: pageId,
            pais: country,
            total: anuncios.length,
            anuncios
        });
    } catch (error) {
        console.error('Ad Library API error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// TIKTOK - Research API
// =============================================
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
        const resp = await fetch('https://open.tiktokapis.com/v2/research/user/info/?fields=display_name,follower_count,following_count,likes_count,video_count,avatar_url,bio_description,is_verified', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ username })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data?.error?.message || 'Error TikTok API');

        const user = data.data || {};
        res.json({
            source: 'tiktok',
            username,
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

// =============================================
// RANKING - Comparar mi negocio vs competencia
// =============================================
router.get('/ranking', async (req, res) => {
    // Expects query: ?accounts=ig:mine,ig:comp1,ig:comp2,fb:pageid
    const userToken = process.env.META_USER_TOKEN;
    const appToken = getAppToken();

    if (!userToken && !appToken) {
        return res.status(400).json({ error: 'Configura las API keys de Meta en .env' });
    }

    const accountsParam = req.query.accounts || '';
    const accounts = accountsParam.split(',').filter(Boolean).slice(0, 10);

    const results = [];

    for (const acc of accounts) {
        const [platform, id] = acc.split(':');
        try {
            if (platform === 'fb' && appToken) {
                const data = await graphGet(id, appToken, {
                    fields: 'name,fan_count,followers_count,picture.width(100)'
                });
                results.push({
                    platform: 'facebook',
                    id,
                    nombre: data.name || id,
                    seguidores: data.followers_count || data.fan_count || 0,
                    likes: data.fan_count || 0,
                    foto: data.picture?.data?.url || ''
                });
            } else if (platform === 'ig' && userToken) {
                // Get my IG ID first
                const accounts = await graphGet('me/accounts', userToken);
                if (!accounts.data?.length) continue;
                const pageData = await graphGet(accounts.data[0].id, accounts.data[0].access_token || userToken, { fields: 'instagram_business_account' });
                if (!pageData.instagram_business_account) continue;
                const myIgId = pageData.instagram_business_account.id;

                const bd = await graphGet(myIgId, accounts.data[0].access_token || userToken, {
                    fields: `business_discovery.fields(username,name,followers_count,media_count,profile_picture_url,media.limit(3){like_count,comments_count}).username(${id})`
                });
                const p = bd.business_discovery;
                const media = p.media?.data || [];
                const totalEng = media.reduce((s, m) => s + (m.like_count || 0) + (m.comments_count || 0), 0);

                results.push({
                    platform: 'instagram',
                    id,
                    nombre: p.name || id,
                    seguidores: p.followers_count || 0,
                    publicaciones: p.media_count || 0,
                    engagement_promedio: media.length > 0 ? Math.round(totalEng / media.length) : 0,
                    foto: p.profile_picture_url || ''
                });
            }
        } catch (e) {
            results.push({ platform: platform, id, nombre: id, seguidores: 0, error: e.message });
        }
    }

    // Sort by followers descending
    results.sort((a, b) => (b.seguidores || 0) - (a.seguidores || 0));

    // Add rank
    results.forEach((r, i) => { r.rank = i + 1; });

    res.json({ ranking: results });
});

module.exports = router;
