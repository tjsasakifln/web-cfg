function offerAvailability(offer) {
  const contractable =
    offer && offer.status === "APPROVED" && offer.kill_switch === false && offer.capacity_required === false;
  return contractable ? "https://schema.org/InStock" : "https://schema.org/SoldOut";
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
  const realPriceExpiry = offer.price_valid_until || offer.effective_to || null;
  if (realPriceExpiry) data.priceValidUntil = realPriceExpiry;
  return data;
}

module.exports = { offerAvailability, offerStructuredData };
