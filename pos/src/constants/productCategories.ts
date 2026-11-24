export const PRODUCT_CATEGORIES = [
  "Beverages (Drinks & Water)",
  "Milk & Dairy Products",
  "Hot Drinks (Tea, Coffee & Cocoa)",
  "Grains, Noodles & Staples",
  "Seasonings, Condiments & Oil",
  "Snacks, Biscuits & Confectionery",
  "Soap & Detergent",
  "Personal Care (Hair, Skin & Oral)",
  "Baby Products & Hygiene",
  "Household & Insect Control",
  "Eggs & Poultry",
  "Baking Supplies",
  "Stationery",
  "Other / Miscellaneous"
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
