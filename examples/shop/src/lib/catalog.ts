export interface Review {
  _type: 'review';
  id: string;
  author: string;
  body: string;
  rating: number;
}

export interface Variant {
  _type: 'variant';
  id: string;
  sku: string;
  label: string;
  availability: string;
  priceLabel: string;
}

export interface Product {
  _type: 'product';
  id: string;
  sku: string;
  title: string;
  tagline: string;
  description: string;
  slug: string;
  imageUrl: string;
  priceLabel: string;
  category: string;
  publishedAt: string;
  variants: Variant[];
  reviews: Review[];
  seo: { title: string; description: string };
}

// Seeded so a product keeps its shape between requests while still looking
// like a catalogue rather than lorem ipsum.
function rng(seed: number): () => number {
  let state = seed * 2654435761 + 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const MATERIALS = ['Suede', 'Canvas', 'Leather', 'Knit', 'Wool', 'Linen', 'Denim'];
const OBJECTS = ['Runner', 'Boot', 'Loafer', 'Sandal', 'Trainer', 'Clog', 'Derby'];
const QUALITIES = ['Soft', 'Rugged', 'Featherlight', 'Everyday', 'All-weather', 'Heritage'];
const COLOURS = ['Sand', 'Charcoal', 'Olive', 'Rust', 'Ink', 'Bone', 'Moss'];
const SIZES = ['38', '39', '40', '41', '42', '43'];
const CATEGORIES = ['Footwear', 'Outdoor', 'Everyday', 'Workwear'];
const NAMES = ['Asha', 'Ravi', 'Nina', 'Omar', 'Lea', 'Tom', 'Mira', 'Jonas'];
const PRAISE = [
  'Comfortable straight out of the box and still holding up after a wet winter.',
  'Runs half a size small, but the leather softened within a week.',
  'Bought a second pair in another colour. That says it all.',
  'Light enough for travel and smart enough for the office.',
];

const pick = <T>(list: T[], random: () => number): T => list[Math.floor(random() * list.length)]!;

export function makeProduct(index: number): Product {
  const random = rng(index + 1);
  const quality = pick(QUALITIES, random);
  const material = pick(MATERIALS, random);
  const object = pick(OBJECTS, random);
  const title = `${quality} ${material} ${object}`;
  const price = 40 + Math.floor(random() * 160);

  return {
    _type: 'product' as const,
    id: `p${index}`,
    sku: `SKU-${1000 + index}`,
    title,
    tagline: `${material} upper, ${pick(['cork', 'rubber', 'foam'], random)} sole.`,
    description:
      `The ${title.toLowerCase()} is built for ${pick(['long days', 'wet mornings', 'city walking'], random)}. ` +
      `We cut it from ${material.toLowerCase()} and finish it by hand, so no two pairs look quite alike.`,
    slug: `${object.toLowerCase()}-${index}`,
    imageUrl: `https://picsum.photos/seed/${index}/640/480`,
    priceLabel: `€${price}`,
    category: pick(CATEGORIES, random),
    publishedAt: new Date(Date.UTC(2026, index % 12, (index % 27) + 1)).toISOString(),
    variants: Array.from({ length: 2 + Math.floor(random() * 2) }, (_, v) => ({
      _type: 'variant' as const,
      id: `p${index}v${v}`,
      sku: `SKU-${1000 + index}-${v}`,
      label: `${pick(COLOURS, random)} / ${pick(SIZES, random)}`,
      availability: random() > 0.25 ? 'In stock, ships tomorrow' : 'Back in three weeks',
      priceLabel: `€${price + v * 5}`,
    })),
    reviews: Array.from({ length: 1 + Math.floor(random() * 3) }, (_, r) => ({
      _type: 'review' as const,
      id: `p${index}r${r}`,
      author: pick(NAMES, random),
      body: pick(PRAISE, random),
      rating: 3 + Math.floor(random() * 3),
    })),
    seo: { title: `${title} | Example Shop`, description: `Buy the ${title.toLowerCase()}.` },
  };
}

export function makeCatalogue(count: number): Product[] {
  return Array.from({ length: count }, (_, i) => makeProduct(i));
}
