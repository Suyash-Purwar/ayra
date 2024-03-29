import { Router } from "express";
import * as webhookController from "../controllers/webhook.controller.js";
import authenticate from "../middleware/authenticate.js";
import markAsRead from "../middleware/mark-read.js";

const router = Router();

router.get("/receive", webhookController.verifyWebhook);
router.post(
  "/receive",
  authenticate,
  webhookController.processMessage,
  markAsRead
);

router.get("/getAttendanceImage", webhookController.getAttendanceImage);

export default router;
