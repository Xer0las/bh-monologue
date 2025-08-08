export function ipFromHeaders(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf;
  const real = h.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
