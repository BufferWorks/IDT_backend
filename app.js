const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const expressSession = require("express-session");

require("dotenv").config();

const connectDB = require("./database/connection");

const authRoute=require('./routes/auth')
const applicantRoutes = require('./routes/applicants.js');
const contestRoutes = require('./routes/contest.js');
  


connectDB();

app.use(cors({
  origin: "*",
  credentials: true,
}));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));
app.use(cookieParser());
app.use(expressSession({
    resave: false,
    saveUninitialized: false,
    secret: process.env.EXPRESS_SESSION_SECRET,
  })
);
app.use(express.static(path.join(__dirname, "public")));



app.use('/api/auth',authRoute)
app.use('/api/applicants', applicantRoutes);
app.use('/api/contests', contestRoutes);
app.get('/',(req,res)=>{
  return res.json({message:"pinging"})
})






app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
