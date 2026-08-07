import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { UserModel } from '../models/userModel';
import { CONFIG } from '../config';
import { ActivityModel } from '../models/activityModel';

export class AuthController {
  static getLogin(req: Request, res: Response): void {
    const error = req.query.err as string | undefined;
    const success = req.query.msg as string | undefined;

    res.render('auth/login', {
      title: 'Sign In',
      error,
      success
    });
  }

  static postLogin(req: Request, res: Response): void {
    const { identifier, password, remember } = req.body;

    if (!identifier || !password) {
      return res.redirect('/login?err=missing_fields');
    }

    const trimmed = identifier.trim();
    const user = validator.isEmail(trimmed)
      ? UserModel.findByEmail(trimmed)
      : UserModel.findByUsername(trimmed);

    if (!user) {
      return res.redirect('/login?err=invalid_credentials');
    }

    if (user.status === 'suspended') {
      return res.redirect('/login?err=account_suspended');
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.redirect('/login?err=invalid_credentials');
    }

    // Update last login
    UserModel.updateLastLogin(user.id);

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.avatar = user.avatar;
    req.session.role = user.role;

    if (remember === 'on') {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }

    ActivityModel.log(user.id, user.username, 'USER_LOGIN', `User logged in from ${req.ip || '127.0.0.1'}`);

    res.redirect('/dashboard');
  }

  static getRegister(req: Request, res: Response): void {
    const error = req.query.err as string | undefined;
    res.render('auth/register', {
      title: 'Create Account',
      error
    });
  }

  static postRegister(req: Request, res: Response): void {
    const { username, email, password, confirm_password } = req.body;

    if (!username || !email || !password || !confirm_password) {
      return res.redirect('/register?err=missing_fields');
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      return res.redirect('/register?err=short_username');
    }

    if (!validator.isEmail(cleanEmail)) {
      return res.redirect('/register?err=invalid_email');
    }

    if (password.length < 6) {
      return res.redirect('/register?err=short_password');
    }

    if (password !== confirm_password) {
      return res.redirect('/register?err=password_mismatch');
    }

    if (UserModel.findByUsername(cleanUsername)) {
      return res.redirect('/register?err=username_taken');
    }

    if (UserModel.findByEmail(cleanEmail)) {
      return res.redirect('/register?err=email_taken');
    }

    // Random avatar pick between Steve and Alex
    const randomAvatar = CONFIG.AVATARS[Math.floor(Math.random() * CONFIG.AVATARS.length)];
    const password_hash = bcrypt.hashSync(password, 10);

    const newUser = UserModel.create({
      username: cleanUsername,
      email: cleanEmail,
      password_hash,
      avatar: randomAvatar
    });

    // Update last login
    UserModel.updateLastLogin(newUser.id);

    ActivityModel.log(newUser.id, newUser.username, 'ACCOUNT_CREATED', `New account created as ${newUser.role}: ${cleanUsername}`);

    // Auto login after registration
    req.session.userId = newUser.id;
    req.session.username = newUser.username;
    req.session.avatar = newUser.avatar;
    req.session.role = newUser.role;

    res.redirect('/dashboard');
  }

  static logout(req: Request, res: Response): void {
    if (req.session) {
      req.session.destroy(() => {
        res.redirect('/login?msg=logged_out');
      });
    } else {
      res.redirect('/login');
    }
  }
}
