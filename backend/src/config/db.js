"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
dotenv_1.default.config();
exports.pool = new pg_1.default.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});
