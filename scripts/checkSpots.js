const mongoose = require('mongoose');

async function checkSpots() {
  try {
    await mongoose.connect('mongodb+srv://projectmates2026:suprakashsanjai@project1.r8wwy.mongodb.net/?retryWrites=true&w=majority&appName=project1');
    const spots = await mongoose.connection.db.collection('spots').find(
      {
        "location.coordinates": {
          $exists: true,
          $type: "array",
          $not: { $size: 0 }
        }
      },
      { "location.coordinates": 1 }
    ).toArray();
    console.log(spots);
    process.exit(0);
  } catch (error) {
    console.error('Error checking spots:', error);
    process.exit(1);
  }
}

checkSpots();
