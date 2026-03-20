function attachGeoContext(req, res, next) {
    req.geo = {
        country: req.headers['x-vercel-ip-country'] || 'unknown',
        region: req.headers['x-vercel-ip-country-region'] || 'unknown',
        city: decodeURIComponent(req.headers['x-vercel-ip-city'] || 'unknown'),
        ip: req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip
    };
    next();
}

module.exports = { attachGeoContext };
