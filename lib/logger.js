const log = (level, event, data = {}) => {
    const entry = {
        level,
        event,
        timestamp: new Date().toISOString(),
        ...data
    };
    if (process.env.NODE_ENV === 'production') {
        console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](JSON.stringify(entry));
    } else {
        const { timestamp, ...rest } = entry;
        console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](`[${level}] ${event}`, Object.keys(rest).length > 2 ? rest : '');
    }
};

module.exports = {
    info: (event, data) => log('INFO', event, data),
    warn: (event, data) => log('WARN', event, data),
    error: (event, data) => log('ERROR', event, data),
    security: (event, data) => log('SECURITY', event, data),
};
