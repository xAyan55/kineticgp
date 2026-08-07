import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login?err=unauthorized');
}

export function redirectIfAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}
