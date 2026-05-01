const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPhoneOrTablet, pickVariant } = require('./deviceRouter');

test('isPhoneOrTablet returns true for iPhone UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    assert.equal(isPhoneOrTablet(ua), true);
});

test('isPhoneOrTablet returns true for iPad UA', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    assert.equal(isPhoneOrTablet(ua), true);
});

test('isPhoneOrTablet returns true for Android phone UA', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
    assert.equal(isPhoneOrTablet(ua), true);
});

test('isPhoneOrTablet returns false for Mac desktop UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15';
    assert.equal(isPhoneOrTablet(ua), false);
});

test('isPhoneOrTablet returns false for Windows desktop UA', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    assert.equal(isPhoneOrTablet(ua), false);
});

test('isPhoneOrTablet returns false for empty or missing UA', () => {
    assert.equal(isPhoneOrTablet(''), false);
    assert.equal(isPhoneOrTablet(undefined), false);
    assert.equal(isPhoneOrTablet(null), false);
});

test('pickVariant returns pwa name for mobile UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    assert.equal(pickVariant('dashboard', ua), 'dashboard');
});

test('pickVariant returns -desktop suffix for desktop UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)';
    assert.equal(pickVariant('dashboard', ua), 'dashboard-desktop');
});

test('pickVariant respects nested view paths', () => {
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    assert.equal(pickVariant('almacen/inventario', desktopUA), 'almacen/inventario-desktop');
});
