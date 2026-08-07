"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LandingController = void 0;
const settingModel_1 = require("../models/settingModel");
class LandingController {
    static getLanding(req, res) {
        const siteTitle = settingModel_1.SettingModel.get('site_title', 'KineticGP Panel');
        const siteDescription = settingModel_1.SettingModel.get('site_description', 'Modern Self-Hosted Minecraft Server Management Panel');
        res.render('landing', {
            title: 'Home',
            siteTitle,
            siteDescription,
            user: req.session?.userId ? { username: req.session.username, avatar: req.session.avatar } : null
        });
    }
}
exports.LandingController = LandingController;
