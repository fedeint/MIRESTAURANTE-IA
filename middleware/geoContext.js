function attachGeoContext(req, res, next) {
    req.geo = {
        country: req.headers['x-vercel-ip-country'] || 'unknown',
        region: req.headers['x-vercel-ip-country-region'] || 'unknown',
        city: decodeURIComponent(req.headers['x-vercel-ip-city'] || 'unknown'),
        ip: req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip
    };
    req.geo.lat = parseFloat(req.headers['x-vercel-ip-latitude']) || null
    req.geo.lon = parseFloat(req.headers['x-vercel-ip-longitude']) || null
    next();
}

module.exports = { attachGeoContext };
