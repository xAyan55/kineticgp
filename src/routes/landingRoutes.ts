import { Router } from 'express';
import { LandingController } from '../controllers/landingController';

const router = Router();
router.get('/', LandingController.getLanding);

export default router;
