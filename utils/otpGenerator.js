const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000); // 4-digit
};

module.exports = generateOtp;
