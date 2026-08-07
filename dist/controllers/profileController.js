"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userModel_1 = require("../models/userModel");
const activityModel_1 = require("../models/activityModel");
class ProfileController {
    static getProfile(req, res) {
        const userId = req.session.userId;
        const user = userModel_1.UserModel.findById(userId);
        if (!user) {
            return res.redirect('/login');
        }
        const error = req.query.err;
        const success = req.query.msg;
        res.render('profile/index', {
            title: 'Profile Settings',
            user,
            error,
            success
        });
    }
    static updateUsername(req, res) {
        const userId = req.session.userId;
        const { username } = req.body;
        if (!username || username.trim().length < 3) {
            return res.redirect('/dashboard/profile?err=invalid_username');
        }
        const cleanUsername = username.trim();
        const existing = userModel_1.UserModel.findByUsername(cleanUsername);
        if (existing && existing.id !== userId) {
            return res.redirect('/dashboard/profile?err=username_taken');
        }
        userModel_1.UserModel.updateUsername(userId, cleanUsername);
        req.session.username = cleanUsername;
        activityModel_1.ActivityModel.log(userId, cleanUsername, 'PROFILE_UPDATE', `Updated username to "${cleanUsername}"`);
        res.redirect('/dashboard/profile?msg=username_updated');
    }
    static updatePassword(req, res) {
        const userId = req.session.userId;
        const { current_password, new_password, confirm_password } = req.body;
        if (!current_password || !new_password || !confirm_password) {
            return res.redirect('/dashboard/profile?err=missing_fields');
        }
        const user = userModel_1.UserModel.findById(userId);
        const isValid = bcryptjs_1.default.compareSync(current_password, user.password_hash);
        if (!isValid) {
            return res.redirect('/dashboard/profile?err=wrong_current_password');
        }
        if (new_password.length < 6) {
            return res.redirect('/dashboard/profile?err=short_password');
        }
        if (new_password !== confirm_password) {
            return res.redirect('/dashboard/profile?err=password_mismatch');
        }
        const password_hash = bcryptjs_1.default.hashSync(new_password, 10);
        userModel_1.UserModel.updatePassword(userId, password_hash);
        activityModel_1.ActivityModel.log(userId, user.username, 'SECURITY_UPDATE', 'Changed account password');
        res.redirect('/dashboard/profile?msg=password_updated');
    }
    static updateAvatar(req, res) {
        const userId = req.session.userId;
        const { avatar } = req.body;
        if (!avatar || typeof avatar !== 'string') {
            return res.redirect('/dashboard/profile?err=invalid_avatar');
        }
        userModel_1.UserModel.updateAvatar(userId, avatar);
        req.session.avatar = avatar;
        activityModel_1.ActivityModel.log(userId, req.session.username, 'PROFILE_UPDATE', 'Updated account avatar');
        res.redirect('/dashboard/profile?msg=avatar_updated');
    }
}
exports.ProfileController = ProfileController;
