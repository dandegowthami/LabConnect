import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';

export async function authenticate(req, res, next) {
  const authorization = req.get('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  try {
    const claims = jwt.verify(token, env.JWT_SECRET);
    if (typeof claims === 'string' || !['patient', 'staff', 'admin', 'pathologist', 'doctor'].includes(claims.role)) {
      res.status(401).json({ success: false, message: 'Invalid authentication token' });
      return;
    }

    if (claims.role !== 'patient') {
      const user = await User.findById(claims.sub).select('_id role isActive name email doctorId');
      if (!user || !user.isActive || user.role !== claims.role) {
        res.status(401).json({ success: false, message: 'Account is inactive or no longer available' });
        return;
      }

      req.auth = { sub: user.id, role: user.role, doctorId: user.doctorId ? String(user.doctorId) : null, user };
    } else {
      req.auth = {
        sub: claims.sub,
        role: 'patient',
        contactVerified: true,
        patientId: typeof claims.patientId === 'string' ? claims.patientId : null,
        contactSessionId: typeof claims.contactSessionId === 'string' ? claims.contactSessionId : null
      };
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
      return;
    }

    next(error);
  }
}
