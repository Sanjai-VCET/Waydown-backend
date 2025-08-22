// controller/aiController.js
const axios = require('axios');

exports.chat = async (req, res) => {
  const { message } = req.body;

  try {
    const response = await axios.post('https://waydownnn.app.n8n.cloud/webhook/107235e8-0191-4b87-a4d1-66b1df2306d1/chat', { message });
    res.json({ message: response.data });
  } catch (error) {
    res.status(500).json({ error: 'Error communicating with AI service' });
  }
};
