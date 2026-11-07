export function privateNoStore(req, res, next) {
  res.set({
    'Cache-Control': 'private, no-store',
    Pragma: 'no-cache'
  });
  next();
}
