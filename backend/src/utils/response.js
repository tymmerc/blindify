"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
function ok(res, data, status = 200) {
    return res.status(status).json({ success: true, data, error: null });
}
function fail(res, code, message, status = 400, details) {
    return res.status(status).json({
        success: false,
        data: null,
        error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
}
