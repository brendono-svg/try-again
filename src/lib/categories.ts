export type CategoryGroup = 'income' | 'needs' | 'wants' | 'savings' | 'other' | 'transfer';

export interface CategoryDef {
  name: string;
  group: CategoryGroup;
  /** Short hint shown in the budget planner. */
  hint?: string;
}

export const UNCATEGORISED = 'Uncategorised';
export const TRANSFER = 'Transfers';
export const CARD_PAYMENT = 'Credit Card Payments';

export const CATEGORIES: CategoryDef[] = [
  { name: 'Salary & Wages', group: 'income' },
  { name: 'Interest & Dividends', group: 'income' },
  { name: 'Other Income', group: 'income' },

  { name: 'Mortgage & Rent', group: 'needs' },
  { name: 'Loan Repayments', group: 'needs' },
  { name: 'Groceries', group: 'needs' },
  { name: 'Power, Gas & Water', group: 'needs' },
  { name: 'Internet & Phone', group: 'needs' },
  { name: 'Insurance', group: 'needs' },
  { name: 'Fuel', group: 'needs' },
  { name: 'Public Transport & Parking', group: 'needs' },
  { name: 'Vehicle Costs', group: 'needs', hint: 'Rego, WOF, servicing, tolls' },
  { name: 'Health & Medical', group: 'needs' },
  { name: 'Pets', group: 'needs' },
  { name: 'Childcare & Education', group: 'needs' },
  { name: 'Rates, Tax & Government', group: 'needs' },
  { name: 'Home & Maintenance', group: 'needs' },

  { name: 'Cafes & Coffee', group: 'wants' },
  { name: 'Eating Out & Takeaways', group: 'wants' },
  { name: 'Alcohol', group: 'wants' },
  { name: 'Shopping', group: 'wants' },
  { name: 'Clothing', group: 'wants' },
  { name: 'Electronics', group: 'wants' },
  { name: 'Entertainment & Events', group: 'wants' },
  { name: 'Subscriptions', group: 'wants' },
  { name: 'Hobbies & Games', group: 'wants' },
  { name: 'Travel & Holidays', group: 'wants' },
  { name: 'Personal Care & Fitness', group: 'wants' },
  { name: 'Gifts & Donations', group: 'wants' },

  { name: 'Savings & Investments', group: 'savings', hint: 'KiwiSaver top-ups, Sharesies, term deposits' },

  { name: 'Cash Withdrawals', group: 'other' },
  { name: 'Fees & Interest', group: 'other' },
  { name: UNCATEGORISED, group: 'other' },

  { name: TRANSFER, group: 'transfer', hint: 'Money moved between your own / household accounts' },
  { name: CARD_PAYMENT, group: 'transfer' },
];

const byName = new Map(CATEGORIES.map((c) => [c.name, c]));

export function categoryGroup(name: string): CategoryGroup {
  return byName.get(name)?.group ?? 'other';
}

/** Categories that count as spending (money out of the household). */
export function isSpendingCategory(name: string): boolean {
  const g = categoryGroup(name);
  return g === 'needs' || g === 'wants' || g === 'other';
}

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  income: 'Income',
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
  other: 'Other',
  transfer: 'Transfers',
};

/**
 * Built-in categorisation rules, tuned for NZ merchants. Patterns are tested
 * against the lower-cased description. Order matters: first match wins.
 * Each rule may optionally only apply to money in or money out.
 */
export interface BuiltInRule {
  re: RegExp;
  category: string;
  direction?: 'in' | 'out';
}

const r = (re: RegExp, category: string, direction?: 'in' | 'out'): BuiltInRule => ({ re, category, direction });

export const BUILT_IN_RULES: BuiltInRule[] = [
  // Transfers & card payments first – they must never count as spending.
  r(/payment received|thank you payment|^payment - thank you|cc payment|credit card payment/, CARD_PAYMENT),
  r(/\bto \*{4,}\s?\d{4}\b|\bfrom \*{4,}\s?\d{4}\b/, CARD_PAYMENT),
  r(/internet transfer|transfer (to|from)|\btfr\b|funds transfer|online transfer|\bjoint\b|round ?up|save the change/, TRANSFER),

  // Income
  r(/salar|wages|\bpayroll|\bpay\b.*\b(ltd|limited)\b|\bsal\b/, 'Salary & Wages', 'in'),
  r(/credit interest|interest (paid|credit)|dividend|bonus interest/, 'Interest & Dividends', 'in'),
  r(/\bird\b.*(refund|ref)|tax refund|msd|work and income|winz|best start|working for families/, 'Other Income', 'in'),

  // Fees & interest charged
  r(/foreign currency fee|account fee|monthly fee|\bfee\b|interest charged|debit interest|overdrawn|dishonour|card fee|conv fee/, 'Fees & Interest', 'out'),

  // Housing
  r(/mortgage|home loan|\brent\b|property management|barfoot|harcourts.*rent|quinovic|tenancy/, 'Mortgage & Rent'),
  r(/loan repayment|^loan\b|personal loan|car loan|afterpay|laybuy|zip pay|humm|q card|gem visa|finance now|latitude/, 'Loan Repayments'),

  // Savings & investments
  r(/kiwisaver|sharesies|hatch|kernel|simplicity|inv(estment)? ?now|smartshares|superlife|milford|term deposit|stake\b|tiaki|savvy|investment/, 'Savings & Investments', 'out'),

  // Groceries
  r(/new world|countdown|woolworths|pak ?n ?save|paknsave|four square|fresh ?choice|super ?value|farro|huckleberry|moore wilson|costco|night ?n ?day|on the spot|supermarket|fruit ?world|the warehouse grocer|asian supermarket|tai ping|bin inn|butcher|green ?grocer|organic|superette|deli\b|fish market|seafood/, 'Groceries'),

  // Utilities
  r(/mercury|genesis|contact energy|meridian|trustpower|manawa|electric kiwi|flick|nova energy|pulse energy|powershop|frank energy|vector|watercare|wellington water|rockgas|elgas|ecotricity|octopus energy|energy online/, 'Power, Gas & Water'),
  r(/\bspark\b(?! arena)|vodafone|one nz|onenz|2degrees|skinny|slingshot|orcon|bigpipe|voyager|mynetfone|contact broadband|chorus|starlink|\bwoosh\b|kogan mobile|warehouse mobile/, 'Internet & Phone'),

  // Insurance
  r(/insurance|state insurance|\bami\b|aa insurance|tower|southern cross|\bnib\b|partners life|\baia\b|fidelity life|asteron|cove|youi|vero|frank insurance|initio|protecta/, 'Insurance'),

  // Transport
  r(/\bz energy|\bz [a-z]+ (?:auckland|nzl)|^z\b|\bbp ?(connect|2go)|^bp\b|mobil|caltex|\bgull\b|waitomo|\bnpd\b|challenge|allied petroleum|\bfuel\b|petrol|g\.?a\.?s\.? /, 'Fuel'),
  r(/auckland transport|at public transport|\bat hop\b|fullers|metlink|snapper|bee card|uber(?! ?eats)|\bola\b|zoomy|taxi|wilson parking|secure parking|care park|parking|lime\b|beam\b|neuron|interislander|bluebridge|intercity|kiwirail|\bwilson\b|opal fare|tfnsw|myki|go card/, 'Public Transport & Parking'),
  r(/nzta|waka kotahi|\bvtnz\b|\bwof\b|\brego\b|vehicle licen|repco|supercheap|tyre|beaurepaires|midas|mta\b|autobahn|car wash|\baa\b(?! insurance)|road user|tolls?\b|nz transport agency/, 'Vehicle Costs'),

  // Health
  r(/unichem|life pharmacy|chemist warehouse|pharmacy|chemist|medical|doctor|\bgp\b|white cross|tend\.?nz|tend health|dental|dentist|orthodont|physio|optometr|specsavers|ophthalm|hospital|radiology|pathlab|labtests|osteo|chiro|counsell|psycholog|healthpost|clinic|medic\b|accident|urgent care|ambulance/, 'Health & Medical'),
  r(/\bvet\b|vets\b|veterinar|animates|petstock|pet\.co\.nz|pet ?depot|pet ?essentials|pet ?food|spca|dogs?\b|puppy|kitten/, 'Pets'),
  r(/kindy|kindergarten|childcare|daycare|early learning|bestart|barnardos|school|college|university|polytech|\bnzqa\b|studylink|tuition|swim school|baby bunting|baby factory|kids|tonies/, 'Childcare & Education'),
  r(/\bird\b|inland revenue|council|rates|nz post|passport|dia\b|department of internal|ministry of justice|court|land information|\blinz\b/, 'Rates, Tax & Government'),
  r(/bunnings|mitre ?10|placemakers|kings plant barn|palmers|oderings|plumb|electrician|builder|hardware|carpet|curtain|varcoe|filter|healthy water|water tank|heat pump|locksmith|cleaning|gardener|lawn|pest control|stihl|waste|rubbish|skip bin|envirowaste|nick scali|furniture|lighting|bathroom|drycleaning|dry cleaning/, 'Home & Maintenance'),

  // Wants
  r(/coffee|cafe|caf[eé]|espresso|roaster|bakery|bagel|patisserie|lieutenant|scout cafe|little local|provender|amano|best ugly|november cafe|the store|tank |starbucks|muffin break|columbus|robert harris|mojo|kokako|allpress|dunkin|boost juice|sonny bakery|coca-cola|vending|daily bread|bean counter|daily grind|coffix|bakeris|grind|brew bar|juice/, 'Cafes & Coffee'),
  r(/mcdonald|\bkfc\b|burger|domino|pizza|subway|sushi|uber ?eats|doordash|delivereasy|menulog|restaurant|bistro|eatery|kitchen|ramen|noodle|dumpling|thai|indian|kebab|taco|grill|diner|food ?court|carl'?s jr|wendy|nando|hell pizza|pita pit|st pierre|yomi|katsubi|maru|hello mister|bar\b|brewery|tavern|pub\b|surf club|wagamama|gong cha|chatime|takeaway|fish ?n ?chip|chips|catering|brisket|chicken|mexico|kokodak|eats\b|rafters|marameo|\bziti\b|hiso|pavill?ion|wise men|lumino|beaufort|browne st|elysium|compass|white lady|lusen|food truck|dumplings?|cantina|trattoria|osteria|izakaya|yakitori|bbq/, 'Eating Out & Takeaways'),
  r(/liquor|super liquor|glengarry|thirsty|bottle-?o|liquor king|wine|brew|beer|spirits|black bull|purple liquor/, 'Alcohol'),
  r(/spotify|netflix|disney|neon|youtube|apple\.com|itunes|icloud|google (storage|one|play)|microsoft|xbox|game pass|playstation plus|kindle|audible|amazon prime|prime video|sky tv|\bsky\b|chatgpt|openai|claude|anthropic|adobe|dropbox|patreon|substack|paramount|binge|stan\b|shudder|crunchyroll|duolingo|nyt|stuff|nz herald|lightbox|mubi|1password|nordvpn|expressvpn|canva|arlo\.com|ring\.com|nest aware/, 'Subscriptions'),
  r(/steam|playstation|nintendo|epic games|eb games|mighty ape|gametraders|lego|hobby|craft|spotlight|toyworld|kmart toys|warhammer|games workshop|google g[0-9a-z]+ /, 'Hobbies & Games'),
  r(/ticketek|ticketmaster|ticketfairy|eventfinda|spark arena|venue|event cinemas|hoyts|reading cinemas|cinema|rialto|bowling|zoo|aquarium|museum|golf|escape room|timezone|concert|festival|eden park|smz\*venue|bowls|theatre|comedy|gallery/, 'Entertainment & Events'),
  r(/air ?nz|air new zealand|jetstar|qantas|virgin australia|emirates|singapore air|hotel|motel|airbnb|booking\.com|expedia|agoda|hostel|lodge|resort|holiday|bachcare|bookabach|rental car|hertz|avis|budget rent|ezi car|go rentals|jucy|duty free|travel/, 'Travel & Holidays'),
  r(/country road|glassons|hallenstein|cotton on|h ?& ?m|zara|uniqlo|farmers|kathmandu|macpac|icebreaker|rebel sport|platypus|hype dc|foot locker|number one shoes|hannahs|witchery|seed heritage|max fashion|postie|ruby|kowtow|i love ugly|barkers|rodd & gunn|nike|adidas|lululemon|torpedo7|r ?& ?r sport|shoe|bivouac|merino/, 'Clothing'),
  r(/pb tech|noel leeming|jb hi-?fi|harvey norman|apple store|samsung|computer lounge|dick smith|smiths city|1-day|playtech|ascent|mighty ape|bose|sonos/, 'Electronics'),
  r(/hairdress|barber|salon|beauty|nails|spa\b|massage|mecca|sephora|lush|gym|fitness|les mills|city fitness|anytime fitness|snap fitness|f45|crossfit|yoga|pilates|sport|swim|aquatic|jetts|skin institute|skin clinic|cosmetic|dermal/, 'Personal Care & Fitness'),
  r(/donation|charity|red cross|unicef|world vision|salvation army|givealittle|hospice|gift|flowers|florist|interflora|hallmark|whitcoulls|paper plus|appeal|fundrais|sweetlouise|sweet louise|foundation/, 'Gifts & Donations'),
  r(/warehouse|kmart|briscoes|farmers|amazon|temu|shein|aliexpress|ebay|trade ?me|trademe|mighty ape|the market|smiths city|freedom furniture|nood|ikea|bed bath|early settler|target furniture|harvey|owala|dairy|convenience|book|stationery|officemax|warehouse stationery|unbox|shopify|paypal|dymocks|^sp |robomate|idream/, 'Shopping'),

  r(/\batm\b|cash ?out|cash withdrawal|\bcash\b/, 'Cash Withdrawals', 'out'),
];
