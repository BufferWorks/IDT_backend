const client = require('../redis/client');

const saveOtp = async (mobile, otp) => {
  await client.set(`otp:${mobile}`, otp, { EX: 300 }); // expires in 5 min
};

const saveTempUser = async (mobileNumber, name, email, age, gender, password) => {
  await client.set(`tempUser:${mobileNumber}`, JSON.stringify({
    name, email, mobileNumber, age, gender, password,
  }), { EX: 300 });
};

const getTempUser = async (mobileNumber) => {
  return await client.get(`tempUser:${mobileNumber}`);
};


const deleteTempUser=async(mobileNumber)=>{
  return await client.del(`tempUser:${mobileNumber}`);
}

const verifyOtp = async (mobile, inputOtp) => {
  const savedOtp = await client.get(`otp:${mobile}`);
  return savedOtp === inputOtp;
};

module.exports = { saveOtp, verifyOtp,saveTempUser ,getTempUser,deleteTempUser};
