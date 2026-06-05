import type { RequestHandler } from "express";
import type { AuthenticatedRequest } from "../auth/authMiddleware.js";

export const getMe: RequestHandler = (req, res) => {
  const { user } = req as AuthenticatedRequest;

  res.json({
    user
  });
};
