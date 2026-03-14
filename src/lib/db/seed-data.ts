export const venueData = [
  {
    name: '2037 Gottingen (Marquee/Seahorse)',
    address: '2037 Gottingen Street, Halifax, NS',
    city: 'Halifax',
    province: 'NS',
    lat: 44.6532,
    lng: -63.5917,
    venue_type: 'concert_hall',
    website: 'https://2037gottingen.ca',
  },
  {
    name: 'Atlantic Entertainment',
    address: '1216 Hollis Street, Halifax, NS',
    city: 'Halifax',
    province: 'NS',
    lat: 44.6454,
    lng: -63.5745,
    venue_type: 'concert_hall',
    website: 'https://www.aentertainment.ca',
  },
  {
    name: 'Capitol Theatre',
    address: '811 Main Street, Moncton, NB',
    city: 'Moncton',
    province: 'NB',
    lat: 46.0878,
    lng: -64.7782,
    venue_type: 'concert_hall',
    website: 'https://capitol.nb.ca',
  },
  {
    name: 'PEI Symphony Orchestra',
    address: '400 University Avenue, Charlottetown, PEI',
    city: 'Charlottetown',
    province: 'PEI',
    lat: 46.2344,
    lng: -63.1312,
    venue_type: 'concert_hall',
    website: 'https://peisymphony.com',
  },
  {
    name: 'The Ship Pub & Kitchen',
    address: "265 Duckworth Street, St. John's, NL",
    city: "St. John's",
    province: 'NL',
    lat: 47.5675,
    lng: -52.7072,
    venue_type: 'pub',
    website: null,
  },
] as const;

// Source data keyed by venue index — matches order of venueData above
export const sourceData = [
  {
    url: 'https://2037gottingen.ca/events/',
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: true,
  },
  {
    url: 'https://www.aentertainment.ca/events',
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: true,
  },
  {
    url: 'https://capitol.nb.ca/en/tickets-events',
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: true,
  },
  {
    url: 'https://peisymphony.com/events',
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: true,
  },
  {
    // The Ship Pub is Facebook-primary with no confirmed scrapeable URL
    url: 'https://www.facebook.com/TheShipPub/events',
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: false,
  },
] as const;
