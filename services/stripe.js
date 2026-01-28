const STRIPE_API_BASE = 'https://api.stripe.com/v1';

const toCents = (amount) => Math.round(Number(amount || 0) * 100);

const stripeRequest = async (path, body) => {
  if (!global.fetch) {
    throw new Error('Fetch API is not available in this Node.js runtime.');
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY in environment.');
  }
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : 'Stripe request failed.';
    throw new Error(msg);
  }
  return data;
};

const getRequest = async (path) => {
  if (!global.fetch) {
    throw new Error('Fetch API is not available in this Node.js runtime.');
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY in environment.');
  }
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  const data = await response.json();
  if (!response.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : 'Stripe request failed.';
    throw new Error(msg);
  }
  return data;
};

const createPaymentIntent = async (amountSgd) => {
  const amount = toCents(amountSgd);
  if (!amount || amount <= 0) {
    throw new Error('Invalid Stripe amount.');
  }
  const body = new URLSearchParams({
    amount: String(amount),
    currency: 'sgd',
    'payment_method_types[]': 'card'
  });
  return stripeRequest('/payment_intents', body);
};

const getPaymentIntent = async (intentId) => {
  if (!intentId) throw new Error('Missing Stripe PaymentIntent ID.');
  return getRequest(`/payment_intents/${intentId}`);
};

module.exports = { createPaymentIntent, getPaymentIntent };
