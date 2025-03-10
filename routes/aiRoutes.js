// routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const aiController = require('../controller/aiController');

router.post('/chat', aiController.chat);

module.exports = router;
