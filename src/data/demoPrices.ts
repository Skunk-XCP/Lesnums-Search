import demoPrices from "@/data/demo-prices.json";

export type DemoOffer = {
  merchant: string;
  price: number;
};

export type DemoPrice = {
  label: string;
  priceFrom: number;
  currency: string;
  offers: DemoOffer[];
};

type DemoPriceSeed = Omit<DemoPrice, "offers">;

const DEMO_PRICES: Record<string, DemoPriceSeed> = demoPrices;

export const DEMO_PRICE_NOTICE = "Prix simulés pour la démonstration";

function getOfferStep(priceFrom: number) {
  if (priceFrom < 150) return 10;
  if (priceFrom < 500) return 20;
  if (priceFrom < 1_000) return 30;
  if (priceFrom < 2_000) return 50;
  return 100;
}

export function getDemoPrice(documentId: string) {
  const seed = DEMO_PRICES[documentId];
  if (!seed) return undefined;

  const step = getOfferStep(seed.priceFrom);
  return {
    ...seed,
    offers: [
      { merchant: "Fnac", price: seed.priceFrom },
      { merchant: "Darty", price: seed.priceFrom + step },
      { merchant: "Boulanger", price: seed.priceFrom + step * 2 },
    ],
  } satisfies DemoPrice;
}
