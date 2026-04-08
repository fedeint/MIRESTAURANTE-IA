/**
 * Device variant router.
 *
 * Rule: EVERY page that has both variants is rendered through renderForDevice().
 * Phones and tablets → PWA (the base view name).
 * Desktop browsers → the `-desktop` suffixed view.
 *
 * There is ZERO responsive between the two variants. Each template is exclusive.
 * See docs/superpowers/specs/2026-04-08-dashboard-desktop-pwa-separation-design.md
 */

// Includes phones AND tablets. Desktop browsers (Mac/Win/Linux) fall through to false.
const TOUCH_DEVICE_REGEX = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;

function isPhoneOrTablet(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') return false;
    return TOUCH_DEVICE_REGEX.test(userAgent);
}

function pickVariant(viewName, userAgent) {
    return isPhoneOrTablet(userAgent) ? viewName : `${viewName}-desktop`;
}

function renderForDevice(req, res, viewName, data = {}) {
    const ua = req.headers['user-agent'] || '';
    const variant = pickVariant(viewName, ua);
    return res.render(variant, data);
}

module.exports = {
    isPhoneOrTablet,
    pickVariant,
    renderForDevice,
    TOUCH_DEVICE_REGEX,
};
