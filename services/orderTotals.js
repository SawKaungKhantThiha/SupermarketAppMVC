const GST_RATE = 0.09;
const DELIVERY_RATE = 0.15;

const computeTotals = (cart, promoApplied) => {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const promoAmount = promoApplied ? promoApplied.amount : 0;
  const taxableBase = Math.max(0, subtotal - promoAmount);
  const gst = Number((taxableBase * GST_RATE).toFixed(2));
  const deliveryFee = Number((taxableBase * DELIVERY_RATE).toFixed(2));
  const total = Number((taxableBase + gst + deliveryFee).toFixed(2));
  return { subtotal, promoAmount, gst, deliveryFee, total };
};

module.exports = { GST_RATE, DELIVERY_RATE, computeTotals };
