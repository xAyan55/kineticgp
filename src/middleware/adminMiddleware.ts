import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/userModel';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('json')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    res.redirect('/login');
    return;
  }

  const user = UserModel.findById(req.session.userId);

  if (!user || user.status === 'suspended') {
    req.session.destroy(() => {});
    if (req.xhr || req.headers.accept?.includes('json')) {
      res.status(403).json({ success: false, message: 'Account is suspended or invalid' });
      return;
    }
    res.redirect('/login?err=account_suspended');
    return;
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    if (req.xhr || req.headers.accept?.includes('json')) {
      res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      return;
    }
    res.status(403).render('errors/403', {
      title: '403 Forbidden — Admin Access Required',
      user
    });
    return;
  }

  // Update session role if changed
  req.session.role = user.role;
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAdmin(req, res, () => {
    const user = UserModel.findById(req.session.userId!);
    if (!user || user.role !== 'superadmin') {
      if (req.xhr || req.headers.accept?.includes('json')) {
        res.status(403).json({ success: false, message: 'Forbidden: Super Administrator access required' });
        return;
      }
      res.status(403).render('errors/403', {
        title: '403 Forbidden — Super Admin Only',
        user
      });
      return;
    }
    next();
  });
}
