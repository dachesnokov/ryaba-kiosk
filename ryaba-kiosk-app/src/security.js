function normalizeUrl(url) {
  try {
    return new URL(url);
  } catch (_) {
    return null;
  }
}

function wildcardToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isAllowedUrl(rawUrl, config) {
  const url = normalizeUrl(rawUrl);
  if (!url) return false;

  if (!['http:', 'https:'].includes(url.protocol)) return false;

  const allowedOrigins = config.allowedOrigins || [];
  const allowedPaths = config.allowedPaths || ['/*'];

  const originAllowed = allowedOrigins.some((originPattern) => {
    if (originPattern === '*') return true;
    return wildcardToRegExp(originPattern).test(url.origin);
  });

  if (!originAllowed) return false;

  const pathWithSearch = `${url.pathname}${url.search || ''}`;
  return allowedPaths.some((pathPattern) => wildcardToRegExp(pathPattern).test(pathWithSearch));
}

function getSafeHomeUrl(config) {
  const preferred = config.homeUrl || config.localHomeUrl;
  if (preferred && isAllowedUrl(preferred, config)) return preferred;

  const fallbackOrigin = (config.allowedOrigins || [])[0];
  if (fallbackOrigin && fallbackOrigin !== '*') return fallbackOrigin;

  return 'about:blank';
}

module.exports = {
  isAllowedUrl,
  getSafeHomeUrl
};
