const axios = require('axios');

const sendOtp = async (mobile, otp) => {
  const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
    params: {
      authorization: "mQZndMoYEb9ywRlarh6kVLgIWs13CTiGKjFNu2petzJfqcUv8A9yEJInjPwHh8MZdtVGOm7eiYCoNF21",
      message: `your otp is ${otp}`,
      route: 'q',
      numbers: mobile,
    //   authorization: 'YOUR_FAST2SMS_API_KEY',
    //   variables_values: otp,
    //   route: 'otp',
    //   numbers: mobile,
    },
    headers: {
      'cache-control': 'no-cache',
    },
  });

  return response.data;
};

module.exports = sendOtp;
