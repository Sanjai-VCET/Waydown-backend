const mongoose = require('mongoose');

async function checkIndexes() {
  try {
    await mongoose.connect('mongodb+srv://projectmates2026:suprakashsanjai@project1.r8wwy.mongodb.net/?retryWrites=true&w=majority&appName=project1');
    const indexes = await mongoose.connection.db.collection('spots').indexes();
    console.log(indexes);
    process.exit(0);
  } catch (error) {
    console.error('Error checking indexes:', error);
    process.exit(1);
  }
}

checkIndexes();
