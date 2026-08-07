"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const landingController_1 = require("../controllers/landingController");
const router = (0, express_1.Router)();
router.get('/', landingController_1.LandingController.getLanding);
exports.default = router;
