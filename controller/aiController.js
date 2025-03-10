// controller/aiController.js
const axios = require('axios');

exports.chat = async (req, res) => {
  const { message } = req.body;

  try {
    const response = await axios.post('https://projectmates.app.n8n.cloud/webhook/5445dc24-b0a9-4445-ae09-9a35aed42235/chat', { message });
    res.json({ message: response.data });
  } catch (error) {
    res.status(500).json({ error: 'Error communicating with AI service' });
  }
};
