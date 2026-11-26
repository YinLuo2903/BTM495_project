import { PHOTO_DIR } from "../../components/Photo";

/**
 * Photo credits shown on credits.html - the one list of who took each photo and its license.
 * credits.test.ts fails if an image in the repo has no entry here.
 */
export interface PhotoCredit {
  /** Image file name (in frontend/assets/images[/lpvr] or database/Mockdata/images). */
  file: string;
  /** Where the site serves the image, for the thumbnail on the credits page. */
  src: string;
  subject: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
}

const LPVR = "Le Petit Vélo Rouge";
const LPVR_RIGHTS = "All rights reserved";
const instagram = (post: string) => `https://www.instagram.com/p/${post}/`;
const THE_LINK_ARTICLE = "https://thelinknewspaper.ca/article/le-petit-velo-rouge-the-loyola-campus-fix-it-yourself-atelier";
const CC: Record<string, string> = {
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "Public domain": "https://creativecommons.org/publicdomain/mark/1.0/",
};
const commons = (file: string, subject: string, author: string, license: string, page: string): PhotoCredit =>
  ({ file, src: `/uploads/${file}`, subject, author, license, licenseUrl: CC[license], source: `https://commons.wikimedia.org/wiki/File:${page}` });

/** Credit line for the two photos from The Link (also shown on the demo page). */
export const THE_LINK = "Ivan de Jacquelin / The Link";
const shop = (file: string, subject: string, source: string, author = LPVR): PhotoCredit =>
  ({ file, src: `${PHOTO_DIR}/${file}`, subject, author, license: LPVR_RIGHTS, source });

/** Shop logo and photos from the shop's Instagram, plus two photos from The Link. */
export const SITE_CREDITS: PhotoCredit[] = [
  { ...shop("logo.png", "Shop logo", "https://www.instagram.com/LPVR_lepetitvelorouge"), src: "/assets/images/logo.png" },
  shop("hero-workshop.webp", "Bike on a repair stand in the workshop", instagram("ClC4A5Ss5IZ")),
  shop("band-events.webp", "Info table at a campus fair", instagram("Cw5lMh-rnpj")),
  shop("band-items.webp", "Bike on the Loyola campus lawn", instagram("C6zJ-BhgTto")),
  shop("band-appointments.webp", "Volunteer at a repair stand", instagram("CqD7WyJp_uU")),
  shop("band-inventory.webp", "Donated frames waiting for repair", instagram("Cz-HKsEswIB")),
  shop("footer-team.webp", "The team outside the shop", instagram("C0pYwMXA5pU")),
  shop("header-tool-wall.webp", "Tool wall", THE_LINK_ARTICLE, THE_LINK),
  shop("band-orders.webp", "Shop entrance", THE_LINK_ARTICLE, THE_LINK),
];

/** Sample item photos from Wikimedia Commons (database/Mockdata/images). */
export const PRODUCT_CREDITS: PhotoCredit[] = [
  commons("b65adaf0af4a888ee2f185136e3cbb61.webp", "Mountain bike (Orbea Alma M10)", "Glory Cycles", "CC BY 2.0", "Orbea_Alma_M10_2019.jpg"),
  commons("4dd4818bca79eef487e6cdb31f278b8d.webp", "Road bike (Fyxation Carbon Adventure)", "Tim Reddington", "CC BY-SA 4.0", "Fyxation_Carbon_Adventure.jpg"),
  commons("488a3a54d1439751b1385afcd6a46ceb.webp", "Cycling helmet", "Alextredz", "CC BY-SA 4.0", "Cyclist_removing_helmet_after_cycling_on_roads.jpg"),
  commons("ddb3103c0bf5795655442c2b1be24787.webp", "Shimano SPD pedal PD-M520", "Petar Milošević", "CC BY-SA 4.0", "Shimano_SPD_pedal_PD-M520.jpg"),
  commons("3d65359efd27fd4c1eb9859564285e68.webp", "Hutchinson Sector 700x28 tubeless tire", "Richard Masoner / Cyclelicious", "CC BY-SA 2.0", "Hutchinson_Sector_700x28_tubeless_-_8671078012.jpg"),
  commons("0134c27338a4ec67e5caa0e81c4a9ecb.webp", "Greasing a bicycle chain", "Alextredz", "CC BY-SA 4.0", "Greasing_bicycle_chain.jpg"),
  commons("c20beaa231548629e6764e578c1f9140.webp", "LED bike light (Busch & Müller Ixon IQ)", "Singlespeedfahrer", "CC0", "Fahrrad_LED-Akku-Leuchte_Busch_%26_M%C3%BCller_Ixon_IQ.jpg"),
  commons("98a48fc416483043e4e6330cecd73ac1.webp", "Disc brake pads", "PetarM", "CC BY-SA 3.0", "Disc_brake_pads.JPG"),
  commons("962b7e1b388393aa7628b5b07900bf38.webp", "Bicycle floor pump", "Ewok Slayer", "Public domain", "Bike_pump.jpg"),
  commons("f10ed665b35a6a8d05b2038ea372d6b6.webp", "CamelBak hydration pack", "Atomic Taco from Seattle, WA, USA", "CC BY-SA 2.0", "2011_Camelbak_Rogue_Pics_Review_(5715092288).jpg"),
];

/** Sample event photos from Wikimedia Commons (database/Mockdata/images). */
export const EVENT_CREDITS: PhotoCredit[] = [
  commons("b12d8a5a14d966253af28e1d53672a13.webp", "Group ride on a greenway", "evergladesnps", "Public domain", "Nighttime_Bike_Ride_(53602905410).jpg"),
  commons("3903fb9bdcb99e3f8c86e2ee066f6054.webp", "Truing a wheel in a bike shop", "Joe Mabel", "CC BY-SA 3.0", "U_Wash_bicycle_shop_02A.jpg"),
  commons("054bf74da643306e99d5e6eef3e84193.webp", "Mountain bike trail jump", "mypubliclands", "Public domain", "Mountain_of_the_Rogue_Trail_System_in_Oregon_(20914572306).jpg"),
  commons("f5c116e29f7e49ca3a692ee19203afd7.webp", "Fitting a child's helmet", "Airman 1st Class Aaron Montoya", "Public domain", "Children_test_their_riding_skills_at_Bicycle_Rodeo_130807-F-ZB149-783.jpg"),
  commons("9e315b04e695d22b62a46c4ebb7ec72c.webp", "Costumed group ride", "Foto By Freas Photography", "CC BY-SA 4.0", "ZombieBikeRide2014-88.jpg"),
  commons("24d8deaf226ec48301adbc1437982b2f.webp", "Fat bike in the snow", "Anthony DeLorenzo", "CC BY-SA 2.0", "Fat_bike.jpg"),
  commons("42892438382f66a60d04ee9aa131df2b.webp", "Bike shop floor", "Joe Mabel", "CC BY-SA 3.0", "U_Wash_bicycle_shop_01A.jpg"),
  commons("024030b97e47502428754d3f9ab5d967.webp", "Family riding with a cargo bike", "Andrej Shadura", "CC BY-SA 4.0", "Cyclists_in_Vondelpark_2023-03-05_05.jpg"),
  commons("db272b6f3b049ecd419dc76f41166355.webp", "Tire levers and patch kit", "Björn Appel", "CC BY-SA 3.0", "Puncture-repaire-kit.jpg"),
  commons("3a758c2fd38b5d59a3efe5fa473731d1.webp", "Riding on a snowy road", "Sam Beebe", "CC BY 2.0", "Portland_snow_biking_WP.jpg"),
];
