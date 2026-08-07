import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    return next();
  }

  if (!req.session.csrfSecret) {
    req.session.csrfSecret = crypto.randomBytes(24).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfSecret;
  res.locals._csrf = req.session.csrfSecret;

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const clientToken = req.body?._csrf || req.headers['x-csrf-token'];
    if (!clientToken || clientToken !== req.session.csrfSecret) {
      res.status(403).send('Invalid CSRF Token. Please refresh the page and try again.');
      return;
    }
  }

  next();
}
