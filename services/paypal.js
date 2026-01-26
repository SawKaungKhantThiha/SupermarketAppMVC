const PAYPAL_API_BASE = process.env.PAYPAL_API
  || (process.env.PAYPAL_ENVIRONMENT === 'LIVE'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com');

const getAccessToken = async () => {
  if (!global.fetch) {
    throw new Error('Fetch API is not available in this Node.js runtime.');
  }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing PayPal credentials in environment.');
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal auth failed: ${errorText}`);
  }
  const data = await response.json();
  return data.access_token;
};

const createOrder = async (amount) => {
  const token = await getAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'SGD',
            value: Number(amount).toFixed(2)
          }
        }
      ]
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal create order failed: ${errorText}`);
  }
  return response.json();
};

const captureOrder = async (orderId) => {
  const token = await getAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal capture failed: ${errorText}`);
  }
  return response.json();
};

const refundCapture = async (captureId, amount) => {
  const token = await getAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: {
        currency_code: 'SGD',
        value: Number(amount).toFixed(2)
      }
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal refund failed: ${errorText}`);
  }
  return response.json();
};

module.exports = { createOrder, captureOrder, refundCapture };
