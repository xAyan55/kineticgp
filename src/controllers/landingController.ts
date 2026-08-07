import { Request, Response } from 'express';
import { SettingModel } from '../models/settingModel';

export class LandingController {
  static getLanding(req: Request, res: Response): void {
    const siteTitle = SettingModel.get('site_title', 'KineticGP Panel');
    const siteDescription = SettingModel.get('site_description', 'Modern Self-Hosted Minecraft Server Management Panel');

    res.render('landing', {
      title: 'Home',
      siteTitle,
      siteDescription,
      user: req.session?.userId ? { username: req.session.username, avatar: req.session.avatar } : null
    });
  }
}
