function sessionCookieOptions(req) {
  // req.secure honours HTTPS forwarded by our trusted local Nginx proxy.
  return { httpOnly: true, secure: Boolean(req.secure), sameSite: 'lax', path: '/api', maxAge: 7 * 24 * 60 * 60 * 1000 };
}
module.exports = { sessionCookieOptions };
