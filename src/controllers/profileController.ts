import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/userModel';
import { ActivityModel } from '../models/activityModel';

export class ProfileController {
  static getProfile(req: Request, res: Response): void {
    const userId = req.session.userId!;
    const user = UserModel.findById(userId);

    if (!user) {
      return res.redirect('/login');
    }

    const error = req.query.err as string | undefined;
    const success = req.query.msg as string | undefined;

    res.render('profile/index', {
      title: 'Profile Settings',
      user,
      error,
      success
    });
  }

  static updateUsername(req: Request, res: Response): void {
    const userId = req.session.userId!;
    const { username } = req.body;

    if (!username || username.trim().length < 3) {
      return res.redirect('/dashboard/profile?err=invalid_username');
    }

    const cleanUsername = username.trim();
    const existing = UserModel.findByUsername(cleanUsername);

    if (existing && existing.id !== userId) {
      return res.redirect('/dashboard/profile?err=username_taken');
    }

    UserModel.updateUsername(userId, cleanUsername);
    req.session.username = cleanUsername;
    ActivityModel.log(userId, cleanUsername, 'PROFILE_UPDATE', `Updated username to "${cleanUsername}"`);

    res.redirect('/dashboard/profile?msg=username_updated');
  }

  static updatePassword(req: Request, res: Response): void {
    const userId = req.session.userId!;
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      return res.redirect('/dashboard/profile?err=missing_fields');
    }

    const user = UserModel.findById(userId)!;
    const isValid = bcrypt.compareSync(current_password, user.password_hash);
    if (!isValid) {
      return res.redirect('/dashboard/profile?err=wrong_current_password');
    }

    if (new_password.length < 6) {
      return res.redirect('/dashboard/profile?err=short_password');
    }

    if (new_password !== confirm_password) {
      return res.redirect('/dashboard/profile?err=password_mismatch');
    }

    const password_hash = bcrypt.hashSync(new_password, 10);
    UserModel.updatePassword(userId, password_hash);
    ActivityModel.log(userId, user.username, 'SECURITY_UPDATE', 'Changed account password');

    res.redirect('/dashboard/profile?msg=password_updated');
  }

  static updateAvatar(req: Request, res: Response): void {
    const userId = req.session.userId!;
    const { avatar } = req.body;

    if (!avatar || typeof avatar !== 'string') {
      return res.redirect('/dashboard/profile?err=invalid_avatar');
    }

    UserModel.updateAvatar(userId, avatar);
    req.session.avatar = avatar;
    ActivityModel.log(userId, req.session.username!, 'PROFILE_UPDATE', 'Updated account avatar');

    res.redirect('/dashboard/profile?msg=avatar_updated');
  }
}
