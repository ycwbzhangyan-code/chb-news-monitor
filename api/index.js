/**
 * Vercel Serverless 入口
 *
 * Vercel 约定：api/ 目录下的文件自动成为 serverless 函数
 * 本文件复用 src/app.js 的 Express app 实例，保证本地与线上行为一致
 */
const app = require('../src/app');

module.exports = app;
