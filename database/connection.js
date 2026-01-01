const mongoose = require("mongoose");

const connectDB= async()=>{
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          })
          .then(() => console.log("Connected to MongoDB"))
          .catch((err) => console.error("MongoDB connection error:", err));
    } catch (error) {
        console.log(error)
    }
}


module.exports = connectDB;