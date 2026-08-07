"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const validator_1 = __importDefault(require("validator"));
const userModel_1 = require("../models/userModel");
const config_1 = require("../config");
const activityModel_1 = require("../models/activityModel");
class AuthController {
    static getLogin(req, res) {
        const error = req.query.err;
        const success = req.query.msg;
        res.render('auth/login', {
            title: 'Sign In',
            error,
            success
        });
    }
    static postLogin(req, res) {
        const { identifier, password, remember } = req.body;
        if (!identifier || !password) {
            return res.redirect('/login?err=missing_fields');
        }
        const trimmed = identifier.trim();
        const user = validator_1.default.isEmail(trimmed)
            ? userModel_1.UserModel.findByEmail(trimmed)
            : userModel_1.UserModel.findByUsername(trimmed);
        if (!user) {
            return res.redirect('/login?err=invalid_credentials');
        }
        const isValid = bcryptjs_1.default.compareSync(password, user.password_hash);
        if (!isValid) {
            return res.redirect('/login?err=invalid_credentials');
        }
        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.avatar = user.avatar;
        if (remember === 'on') {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }
        activityModel_1.ActivityModel.log(user.id, user.username, 'USER_LOGIN', `User logged in from ${req.ip || '127.0.0.1'}`);
        res.redirect('/dashboard');
    }
    static getRegister(req, res) {
        const error = req.query.err;
        res.render('auth/register', {
            title: 'Create Account',
            error
        });
    }
    static postRegister(req, res) {
        const { username, email, password, confirm_password } = req.body;
        if (!username || !email || !password || !confirm_password) {
            return res.redirect('/register?err=missing_fields');
        }
        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();
        if (cleanUsername.length < 3) {
            return res.redirect('/register?err=short_username');
        }
        if (!validator_1.default.isEmail(cleanEmail)) {
            return res.redirect('/register?err=invalid_email');
        }
        if (password.length < 6) {
            return res.redirect('/register?err=short_password');
        }
        if (password !== confirm_password) {
            return res.redirect('/register?err=password_mismatch');
        }
        if (userModel_1.UserModel.findByUsername(cleanUsername)) {
            return res.redirect('/register?err=username_taken');
        }
        if (userModel_1.UserModel.findByEmail(cleanEmail)) {
            return res.redirect('/register?err=email_taken');
        }
        // Random avatar pick between Steve and Alex
        const randomAvatar = config_1.CONFIG.AVATARS[Math.floor(Math.random() * config_1.CONFIG.AVATARS.length)];
        const password_hash = bcryptjs_1.default.hashSync(password, 10);
        const newUser = userModel_1.UserModel.create({
            username: cleanUsername,
            email: cleanEmail,
            password_hash,
            avatar: randomAvatar
        });
        activityModel_1.ActivityModel.log(newUser.id, newUser.username, 'ACCOUNT_CREATED', `New account created with username: ${cleanUsername}`);
        // Auto login after registration
        req.session.userId = newUser.id;
        req.session.username = newUser.username;
        req.session.avatar = newUser.avatar;
        res.redirect('/dashboard');
    }
    static logout(req, res) {
        if (req.session) {
            req.session.destroy(() => {
                res.redirect('/login?msg=logged_out');
            });
        }
        else {
            res.redirect('/login');
        }
    }
}
exports.AuthController = AuthController;
