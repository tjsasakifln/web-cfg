function offerAvailability(offer) {
  const contractable =
    offer && offer.status === "APPROVED" && offer.kill_switch === false && offer.capacity_required === false;
  return contractable ? "https://schema.org/InStock" : "https://schema.org/SoldOut";
}

function authoritativePriceExpiry(offer) {
  const value = offer && (offer.price_valid_until || offer.effective_to || null);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error("invalid authoritative offer expiry");
  }
  return String(value);
}

function offerStructuredData(offer, { url, sellerId }) {
  const data = {
    "@type": "Offer",
    price: String(offer.amount_cents / 100),
    priceCurrency: offer.currency,
    availability: offerAvailability(offer),
    url,
    seller: { "@id": sellerId },
  };
  const realPriceExpiry = authoritativePriceExpiry(offer);
  if (realPriceExpiry) data.priceValidUntil = realPriceExpiry;
  return data;
}

module.exports = { authoritativePriceExpiry, offerAvailability, offerStructuredData };
