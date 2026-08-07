import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import path from 'path';
import { CONFIG } from './config';
import { initDatabase } from './db/database';
import { csrfProtection } from './middleware/csrfMiddleware';

import landingRoutes from './routes/landingRoutes';
import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import profileRoutes from './routes/profileRoutes';

const app = express();

// Database Initialization
initDatabase();

// View Engine
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'ejs');

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allowed for video sources, cdn scripts, inline svg
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Folder
app.use(express.static(path.join(process.cwd(), 'public')));

// Express Session
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: CONFIG.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// CSRF & View Globals Middleware
app.use(csrfProtection);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.currentUser = req.session?.userId ? {
    id: req.session.userId,
    username: req.session.username,
    avatar: req.session.avatar
  } : null;
  res.locals.path = req.path;
  next();
});

// Routes
app.use('/', landingRoutes);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/dashboard/profile', profileRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).render('landing', {
    title: '404 Page Not Found',
    siteTitle: 'KineticGP Panel',
    siteDescription: 'The requested page could not be found.',
    user: res.locals.currentUser
  });
});

// 500 Global Error Handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled System Error:', err);
  res.status(500).send('Internal Server Error. Please try again later.');
});

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(CONFIG.PORT, () => {
    console.log(`🚀 KineticGP Server running in ${CONFIG.NODE_ENV} mode on http://localhost:${CONFIG.PORT}`);
  });
}

export default app;
