// Helpers shared between the social post API routes and the process background task

export interface VinDetails {
  year?: string;
  make?: string;
  model?: string;
  engine?: string;
  fuel_type?: string;
  [key: string]: string | undefined;
}

export interface ListingFields {
  price?: number | null;
  condition?: string | null;
  description?: string | null;
  vin_details?: VinDetails | null;
}

// Listing must have price, condition, and at least year+make+model before a post can be created
export function isListingComplete(listing: ListingFields): boolean {
  if (!listing.price || !listing.condition) return false;
  const vd = listing.vin_details ?? {};
  return !!(vd.year && vd.make && vd.model);
}

const DEFAULT_TEMPLATE = [
  '🏍️ {year} {make} {model}',
  '💰 ${price} | {condition}',
  'Engine: {engine}',
  '',
  '{description}',
  '',
  '#motorcycle #{make_lower} #dealership #forsale',
].join('\n');

// Fill template placeholders with listing values.
// Template uses {year}, {make}, {model}, {price}, {condition}, {engine}, {description}.
// The ${price} pattern (dollar sign literal + {price} placeholder) is intentional.
export function buildCaption(
  template: string | null | undefined,
  listing: ListingFields
): string {
  const t = template || DEFAULT_TEMPLATE;
  const vd = listing.vin_details ?? {};
  const priceStr = listing.price ? listing.price.toLocaleString() : '';
  const conditionStr = listing.condition ?? '';
  const descStr = listing.description ?? '';

  return t
    .replace(/{year}/g, vd.year ?? '')
    .replace(/{make}/g, vd.make ?? '')
    .replace(/{model}/g, vd.model ?? '')
    .replace(/{make_lower}/g, (vd.make ?? '').toLowerCase())
    .replace(/{engine}/g, vd.engine ?? '')
    .replace(/{fuel_type}/g, vd.fuel_type ?? '')
    .replace(/{price}/g, priceStr)
    .replace(/{condition}/g, conditionStr)
    .replace(/{description}/g, descStr)
    .trim();
}

// Replace {VIN} in the user's search URL template with the actual VIN name
export function buildListingUrl(template: string | null | undefined, vinName: string): string {
  if (!template) return '';
  return template.replace(/{VIN}/g, vinName);
}

// Parse a raw NHTSA DecodeVin results array into our compact VinDetails shape
export function parseNhtsaResults(results: Array<{ Variable: string; Value: string }>): VinDetails {
  const get = (label: string) =>
    results.find((r) => r.Variable === label)?.Value?.trim() || undefined;

  const year   = get('Model Year');
  const make   = get('Make');
  const model  = get('Model');
  const engine = get('Engine Model') ?? get('Displacement (L)');
  const fuel   = get('Fuel Type - Primary');

  const details: VinDetails = {};
  if (year)   details.year = year;
  if (make)   details.make = make;
  if (model)  details.model = model;
  if (engine) details.engine = engine;
  if (fuel)   details.fuel_type = fuel;
  return details;
}

export { DEFAULT_TEMPLATE };
