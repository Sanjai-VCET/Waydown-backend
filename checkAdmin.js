const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const adminUsers = await User.find({ isAdmin: true });
    console.log('Admin users:', adminUsers);
    process.exit(0);
  } catch (err) {
    console.error('Error checking admin users:', err);
    process.exit(1);
  }
}

checkAdmin();
