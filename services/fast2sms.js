const axios = require("axios");

const FAST2SMS_KEY = process.env.FAST2SMS_API_KEY || null;
const MESSAGE_ID = process.env.WHATSAPP_MESSAGE_ID;        // OTP template ID
const ENTRY_MESSAGE_ID = process.env.WHATSAPP_ENTRY_MESSAGE_ID; // Entry confirmation template ID

const normalizeMobile = (mobile) => {
  let str = String(mobile).replace(/\D/g, ""); // Remove non-digits
  if (str.length === 10) return str;
  if (str.length === 10) return str;
  if (str.length === 11 && str.startsWith("0")) return str.substring(1);
  if (str.length === 12 && str.startsWith("91")) return str.substring(2);
  return str;
};

const sendOtp = async (mobile, otp) => {
  const cleanMobile = normalizeMobile(mobile);

  const headers = {
    "cache-control": "no-cache",
    "Content-Type": "application/x-www-form-urlencoded", // Important for this endpoint
  };

  if (FAST2SMS_KEY) {
    headers["authorization"] = FAST2SMS_KEY.trim();
  }

  // ✅ WhatsApp API Flow (Fast2SMS Simple)
  if (MESSAGE_ID) {
    const url = "https://www.fast2sms.com/dev/whatsapp";
    const params = new URLSearchParams();
    params.append("route", "whatsapp");
    params.append("message_id", MESSAGE_ID);
    params.append("variables_values", String(otp));
    params.append("numbers", cleanMobile);

    try {
      const response = await axios.post(url, params, { headers });

      if (response.data.return === true) {
        return response.data;
      } else {
        throw new Error(response.data.message || "Fast2SMS returned false");
      }
    } catch (error) {
      console.error(
        "WhatsApp API Error:",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  // ⚠️ Fallback to SMS Flow
  else {
    const url = "https://www.fast2sms.com/dev/bulkV2";
    const params = {
      message: `Your OTP is ${otp}`,
      route: "q",
      numbers: mobile, // SMS API handles prefixes well usually
    };

    try {
      // SMS API uses GET usually
      const response = await axios.get(url, {
        params,
        headers: { ...headers, "Content-Type": "application/json" },
      });
      return response.data;
    } catch (error) {
      console.error(
        "Fast2SMS SMS API Error:",
        error.response?.data || error.message,
      );
      throw error;
    }
  }
};

// ─── Entry Upload Confirmation WhatsApp ─────────────────────────────────────
// Template variables:  {{1}} = Participation No   |   {{2}} = Voting Link
const sendEntryUploadWhatsApp = async (mobile, entryNumber, votingUrl) => {
  const cleanMobile = normalizeMobile(mobile);

  if (!ENTRY_MESSAGE_ID) {
    console.warn('[Fast2SMS] WHATSAPP_ENTRY_MESSAGE_ID not set – skipping entry WhatsApp notification.');
    return;
  }

  const headers = {
    'cache-control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (FAST2SMS_KEY) headers['authorization'] = FAST2SMS_KEY.trim();

  // Fast2SMS dual-variable format: pipe-delimited
  const variablesValues = `${entryNumber}|${votingUrl}`;

  const bannerUrl = process.env.WHATSAPP_BANNER_URL || 'https://media.idteventmanagement.online/logo_jpeg.jpeg';

  const params = new URLSearchParams();
  params.append('route', 'whatsapp');
  params.append('message_id', ENTRY_MESSAGE_ID);
  params.append('variables_values', variablesValues);
  params.append('media_url', bannerUrl);
  params.append('numbers', cleanMobile);

  try {
    const response = await axios.post('https://www.fast2sms.com/dev/whatsapp', params, { headers });
    if (response.data.return === true) {
      console.log(`[Fast2SMS] Entry WhatsApp sent to ${cleanMobile} (entry #${entryNumber})`);
      return response.data;
    } else {
      throw new Error(response.data.message || 'Fast2SMS returned false');
    }
  } catch (error) {
    console.error('[Fast2SMS] Entry WhatsApp Error:', error.response?.data || error.message);
    // Non-fatal – do not re-throw; caller should not fail because of this
  }
};

module.exports = { sendOtp, sendEntryUploadWhatsApp };
