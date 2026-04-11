import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vehicleRouter from "./vehicle";
import authRouter from "./auth";
import rcRouter from "./rc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(vehicleRouter);
router.use(rcRouter);

export default router;
