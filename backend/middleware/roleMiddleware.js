export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ success: false, message: 'You do not have permission to access this resource' });
      return;
    }

    next();
  };
}
