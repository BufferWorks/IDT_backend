const axios = require("axios");

// 1. Generate Access Token
exports.generateAccessToken = async () => {
  try {
    const client_id = process.env.CLIENT_ID;
    const client_secret = process.env.CLIENT_SECRET;
    const client_version = process.env.CLIENT_VERSION || 1;
    const grant_type = process.env.GRANT_TYPE || "client_credentials";

    const tokenResponse = await axios.post(
      `${process.env.AUTHORIZATION_BASE_URL}${process.env.AUTHORIZATION_END_POINT}`,
      {
        client_id,
        client_version,
        client_secret,
        grant_type,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (tokenResponse.status === 200) {
      return {
        success: true,
        accessToken: tokenResponse.data.access_token,
      };
    } else {
      throw new Error("Failed to generate access token");
    }
  } catch (error) {
    console.error(
      "Error generating access token:",
      error.response?.data || error.message,
    );
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
};

// 2. Create Order (The user called this complete_payment)
exports.createOrder = async (
  merchantOrderId,
  amount,
  mobileNumber,
  redirectUrl,
  callbackUrl,
) => {
  try {
    // Get Token
    const tokenResult = await exports.generateAccessToken();
    if (!tokenResult.success) {
      throw new Error(tokenResult.error);
    }
    const accessToken = tokenResult.accessToken;

    console.log("Creating Order for:", merchantOrderId, "Amount:", amount);

    const paymentResponse = await axios.post(
      `${process.env.CREATE_PAYMENT_URL}${process.env.CREATE_PAYMENT_ENDPOINT}`,
      {
        merchantOrderId: merchantOrderId,
        amount: amount, // in paise
        expireAfter: 1200,
        metaInfo: {
          udf1: `mobileNumber:${mobileNumber}`,
          udf2: `merchantOrderId:${merchantOrderId}`,
          udf3: `amount:${amount}`,
          udf4: `redirectUrl:${redirectUrl}`,
          udf5: `callbackUrl:${callbackUrl}`,
        },
        paymentFlow: {
          type: "PG_CHECKOUT",
          message: "Contest Entry Fee",
          merchantUrls: {
            redirectUrl: redirectUrl,
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${accessToken}`,
        },
      },
    );

    const redirectUrlFinal = paymentResponse.data.redirectUrl; // Check API docs if it's data.data.redirectUrl usually
    console.log("redirectUrlFinal", redirectUrlFinal);
    return {
      success: true,
      status: paymentResponse.status,
      orderId: paymentResponse.data.orderId, // Check structure
      redirectUrl: redirectUrlFinal,
      merchantOrderId: merchantOrderId,
    };
  } catch (error) {
    console.error(
      "Error in createOrder:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

// 3. Check Status
exports.checkStatus = async (merchantOrderId) => {
  try {
    const tokenResult = await exports.generateAccessToken();
    const accessToken = tokenResult.accessToken;

    const baseUrl = process.env.CHECK_PAYMENT_URL; // e.g. https://api.phonepe.com/apis/hermes
    const endpoint1 = process.env.CHECK_PAYMENT_ENDPOINT_1; // e.g. /pg/v1/status
    const endpoint2 = process.env.CHECK_PAYMENT_ENDPOINT_2 || ""; // Maybe empty or query param

    let statusUrl = `${baseUrl}${endpoint1}/${merchantOrderId}`;
    if (endpoint2) {
      statusUrl += `${endpoint2}`;
    }

    console.log("Checking Status URL:", statusUrl);

    const response = await axios.get(statusUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
    });

    const data = response.data;

    // Fallback if paymentDetails is empty but top-level state is there
    let txnId = null;
    if (data.paymentDetails && data.paymentDetails.length > 0) {
      txnId = data.paymentDetails[0].transactionId;
    }

    return {
      success: true,
      state: data.state, // "COMPLETED", "FAILED", "PENDING"
      transactionId: txnId,
      gatewayResponse: data,
    };
  } catch (error) {
    console.error("Error in checkStatus:", error.message, error.response?.data);
    return { success: false, state: "PENDING" };
  }
};
