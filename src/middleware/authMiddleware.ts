import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('json') || req.headers['x-requested-with'] === 'XMLHttpRequest') {
    res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    return;
  }
  res.redirect('/login?err=unauthorized');
}

export function redirectIfAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}
