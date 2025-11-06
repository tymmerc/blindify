import type { Response } from "express";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(res: Response, data: T, status = 200): Response<ApiSuccess<T>> {
  return res.status(status).json({ success: true, data, error: null });
}

export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown
): Response<ApiError> {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}
