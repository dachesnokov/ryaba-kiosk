function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return null;

  let candidate = raw;

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function normalizeOrigin(value) {
  const href = normalizeHttpUrl(value);
  if (!href) return null;

  try {
    return new URL(href).origin;
  } catch (_) {
    return null;
  }
}

function pathAllowed(pathname, allowedPaths) {
  const list = Array.isArray(allowedPaths) && allowedPaths.length ? allowedPaths : ['/*'];

  return list.some((rule) => {
    const value = String(rule || '').trim();

    if (!value || value === '*' || value === '/*') return true;

    if (value.endsWith('*')) {
      return pathname.startsWith(value.slice(0, -1));
    }

    return pathname === value || pathname.startsWith(value);
  });
}

function getSafeHomeUrl(config = {}) {
  // coreUrl — это адрес API Ryaba Core, а не стартовая страница.
  // Киоск имеет право открывать сайт только после получения homeUrl/home_url из профиля Ryaba.
  const candidates = [
    config.homeUrl,
    config.home_url,
  ];

  for (const candidate of candidates) {
    const url = normalizeHttpUrl(candidate);
    if (url) return url;
  }

  return 'about:blank';
}

function isAllowedUrl(targetUrl, config = {}) {
  let url;

  try {
    url = new URL(targetUrl);
  } catch (_) {
    return false;
  }

  if (['file:', 'data:', 'about:'].includes(url.protocol)) return true;

  if (!['http:', 'https:'].includes(url.protocol)) return false;

  const homeUrl = getSafeHomeUrl(config);
  const homeOrigin = homeUrl === 'about:blank' ? null : new URL(homeUrl).origin;

  const allowedOrigins = [
    homeOrigin,
    ...(Array.isArray(config.allowedOrigins) ? config.allowedOrigins : []),
    ...(Array.isArray(config.allowed_origins) ? config.allowed_origins : []),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  const uniqueOrigins = [...new Set(allowedOrigins)];

  if (uniqueOrigins.length && !uniqueOrigins.includes(url.origin)) {
    return false;
  }

  const allowedPaths = config.allowedPaths || config.allowed_paths || ['/*'];

  return pathAllowed(url.pathname || '/', allowedPaths);
}

function sanitizeRemoteConfig(config = {}) {
  const homeUrl = getSafeHomeUrl(config);
  const homeOrigin = homeUrl === 'about:blank' ? null : new URL(homeUrl).origin;

  const allowedOrigins = [
    homeOrigin,
    ...(Array.isArray(config.allowedOrigins) ? config.allowedOrigins : []),
    ...(Array.isArray(config.allowed_origins) ? config.allowed_origins : []),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return {
    ...config,
    homeUrl,
    allowedOrigins: [...new Set(allowedOrigins)],
    allowedPaths: config.allowedPaths || config.allowed_paths || ['/*'],
  };
}

module.exports = {
  normalizeHttpUrl,
  normalizeOrigin,
  getSafeHomeUrl,
  isAllowedUrl,
  sanitizeRemoteConfig,
};
