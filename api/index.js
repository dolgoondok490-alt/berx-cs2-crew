// Vercel serverless function — vercel.json бүх /api/* хүсэлтийг энд чиглүүлнэ
const { handle } = require('../lib/handler');
module.exports = (req, res) => handle(req, res);
