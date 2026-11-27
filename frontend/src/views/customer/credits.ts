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
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 2.0 de": "https://creativecommons.org/licenses/by-sa/2.0/de/",
  "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "Public domain": "https://creativecommons.org/publicdomain/mark/1.0/",
};
/** A sample photo stored in database/Mockdata/images and served from /uploads. */
const photo = (file: string, subject: string, author: string, license: string, source: string): PhotoCredit =>
  ({ file, src: `/uploads/${file}`, subject, author, license, licenseUrl: CC[license], source });
const commons = (file: string, subject: string, author: string, license: string, page: string) =>
  photo(file, subject, author, license, `https://commons.wikimedia.org/wiki/File:${page}`);

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

/** Sample item photos from Wikimedia Commons and Flickr (via Openverse), in database/Mockdata/images. */
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
  commons("673bf66ef39f21128327356c9422ecde.webp", "Gravel Bike", "Matti Blume", "CC BY-SA 4.0", "Crossworx,_Velo_24,_Berlin_(VB243512).jpg"),
  commons("ab47d5330aa88a6a68180eab871950a9.webp", "Kids Bike 20\"", "Matti Blume", "CC BY-SA 4.0", "Suncross_Sweetie,_Eurobike_2024,_Frankfurt_am_Main_(EB245525).jpg"),
  commons("bccd876e5311c194377135253ab1d215.webp", "Folding Bike", "Glurois", "CC BY-SA 4.0", "Lulu_Bike_City_fully_folded.jpg"),
  commons("5f803b66f2087b02b3d6fea66b800fe9.webp", "Electric Bike", "Matti Blume", "CC BY-SA 4.0", "Eurobike_2024,_Frankfurt_am_Main_(LRM_20240707_171600).jpg"),
  commons("8f917e6f47fce0ba63e51afae9b0d256.webp", "Fixed Gear Bike", "Anna Frodesiak", "CC0", "Fixed-gear_bicycle_in_China_-_01.JPG"),
  commons("57da859b90bc87ed7cc83a2f0753f179.webp", "Cargo Bike", "Richard Masoner / Cyclelicious", "CC BY-SA 2.0", "IZip_guys_riding_Yuba_Curry_ebike_cargo_bike_longtail.jpg"),
  commons("1d8d92abd813048a529b63d972ab81db.webp", "Refurbished Vintage Road Bike", "Ged Carroll from Hong Kong mostly, HKSAR", "CC BY 2.0", "Faema_steel_racing_bike_used_by_Eddy_Merckx_(26068021782).jpg"),
  commons("77d45109a7441d518ad59c2920413edf.webp", "Kids Helmet", "Dawn Endico from Menlo Park, California", "CC BY-SA 2.0", "Helmeted_boy_on_training_wheels.jpg"),
  commons("0e95b2e4f9205b064888bd3656dcacee.webp", "Reflective Vest", "Magnus Mertens", "CC BY-SA 2.0 de", "Warnweste_gelb.jpg"),
  commons("8e239824f0d7684fc599082c20d9d05f.webp", "Cycling Gloves", "MMRE123", "CC BY-SA 4.0", "BMX_gloves_-_palm.jpg"),
  commons("49f138c41dec5506694846f874eb5e6e.webp", "Cycling Glasses", "John Robert McPherson", "CC BY-SA 4.0", "Old_Toll_Booth_reflected_in_sunglasses_Gateway_Bridge_cycle_and_footway_Murrarie_IMGP3867.jpg"),
  commons("6934e84bd5f6884c1742956d48f2c375.webp", "Bike Bell", "Dietmar Rabich", "CC BY-SA 4.0", "Rome_(Italy),_Bicycle_--_2013_--_4368.jpg"),
  commons("76480be76f015b0f4bfc052ab2e3d11f.webp", "Rear Radar Light", "Handige Harrie", "Public domain", "Rear_lights.JPG"),
  commons("8509c37345e3e49ecfe697ec05101fa1.webp", "Full-Face Helmet", "Mielon", "CC BY-SA 3.0", "Kask_rowerowy_full_face_z_googlami.JPG"),
  commons("baba8de6b917f64b6e9bfa18f07c84ed.webp", "Shimano 11-Speed Cassette", "Petar Milo\u0161evi\u0107", "CC BY-SA 4.0", "Shimano_Hyperglide_cassette_8-speed_CS-HG51_11-32.jpg"),
  commons("df072eb905b1f15033fd89e604728508.webp", "Bike Chain 11-Speed", "Cjp24", "CC BY-SA 4.0", "Racing_bicycle_chain_(detail).jpg"),
  commons("9a1ced6d9e7aecc7727f7164d40e2d7f.webp", "Rear Derailleur", "Thegreenj", "CC BY-SA 3.0", "Rearbikegears.jpg"),
  commons("71ef80239dde370a76b3f25e58049d0a.webp", "Crankset", "https://www.flickr.com/photos/jrees/", "CC BY 2.0", "New_school_%E2%80%93_old_school_%E2%80%93_crankset.jpg"),
  commons("a8986239bb678001abdb80adfe0f2ee3.webp", "Saddle", "Singlespeedfahrer", "CC0", "Bicycle_saddle_Terry_Anatomica_Men_(CityComfort_Men).jpg"),
  commons("b0efac83139ef9ea1e63e5c399acbf4f.webp", "Handlebar", "The original uploader was AndrewDressel at English Wikipedia", "CC BY-SA 3.0", "Handlebar_with_fancy_wrap.JPG"),
  commons("76e8988c12952d4790313478ae42a831.webp", "Disc Brake Rotor", "Petar Milo\u0161evi\u0107", "CC BY-SA 4.0", "Magura_Julie_disk_brake_rotor_160_mm.jpg"),
  commons("835917ff39dbbe60c36e0d4e26d03f9b.webp", "Front Suspension Fork", "AndrewDressel (talk)", "CC BY-SA 3.0", "Leading_link_bicycle_fork_on_a_BuzBike.jpg"),
  commons("1a4fab2343dc5abf04018a0b6107e992.webp", "Inner Tube 700c", "No machine-readable author provided. Baumfreund-FFM assumed ", "Public domain", "Fahrradschlaeuche.jpg"),
  commons("7609cceadd079ece44358ef4ccd0f8ce.webp", "Mountain Bike Tire 29\"", "Forest Service, USDA", "Public domain", "20180227-FS-LSC-0796_(41355039535).jpg"),
  commons("5c67f4edbc5be907ee462e17d8b5a226.webp", "Tire Levers (3 pack)", "Ian Harvey", "Public domain", "TyreLevers.jpg"),
  commons("71f10026f9eef2d5b1c8cbff117fe89f.webp", "Tubeless Sealant", "Tristan Schmurr", "CC BY 2.0", "Tubeless_puncture_-_01.jpg"),
  commons("05bd38ed72c9e6749a1444c41b8cb2b7.webp", "City Tire 26\"", "Petar Milo\u0161evi\u0107", "CC BY-SA 4.0", "Schwalbe_Lugano_700%C3%9725.jpg"),
  commons("7534c6dbfd24c9ee3ce24d93110f6818.webp", "Winter Studded Tire", "Unknown", "CC BY-SA 2.0", "Studded_tires.jpg"),
  commons("9b7b95c60d6cd1a09376fe14f60e1fef.webp", "Valve Adapter Set", "SCEhardt", "CC BY 4.0", "Presta_Adaptor_upright.jpg"),
  commons("81715ffdb811c118332bcc1ba86efa82.webp", "Grease Tub", "R. Henrik Nilsson", "CC BY 4.0", "Circa_1980_Gulf_Gulflex_MP_multipurpose_EP_grease_225g_tube_Sweden_view_1.jpg"),
  commons("bdac29bf15ea81d8398d39a42b594145.webp", "Bike Stand (Home)", "Downtowngal", "CC BY-SA 4.0", "Working_at_a_stand,_Bicycle_Kitchen,_Los_Angeles.jpg"),
  commons("03e9e70b2bd13dcccc8911375fde1bc0.webp", "Brake Cable Kit", "Armchair", "CC BY-SA 3.0", "Universal_Brake_Cable_Ends_2.jpg"),
  commons("e68f9d15d2471c644e77933b34a00e6d.webp", "Handlebar Tape", "JugendstilBikes", "CC BY-SA 3.0", "JugendstilBikes_Miyata760SR09.jpg"),
  commons("16380680e270fa4a5df22a337c015052.webp", "Frame Protection Tape", "Friedjof", "CC BY-SA 4.0", "Koga10.JPG"),
  commons("107d94c4c0f8c15cc57dc10eb5474f0a.webp", "Workshop Tune-Up Voucher", "Mattes", "Public domain", "Zweiradmechanikerwerkstatt_-_Deutsches_Museum_Verkehrszentrum.JPG"),
  commons("a219150758a73f13c15158dae8fc7e02.webp", "Water Bottle Cage", "Tx-re", "CC BY-SA 3.0", "Shimano_PRO_Bottle_Cage_Glass_Fiber_Black.JPG"),
  commons("52edaead09aa20efe4a9e2ebfb49419c.webp", "U-Lock", "Petar Milo\u0161evi\u0107", "CC BY-SA 4.0", "U_lock_severed_with_bolt_cutter.jpg"),
  commons("e79362e376248e51ed37d6a0e74a986a.webp", "Kickstand", "bukk", "CC BY-SA 3.0", "Bike_stand.JPG"),
  commons("03a8168708bcdc1df9d7187f3124ba42.webp", "Fenders Set", "Alexis O'Toole", "CC BY-SA 2.0", "Bicycle-Mudguard-Fender.jpg"),
  commons("6aad607bd8eb020d18763cca0fdc81db.webp", "Front Basket", "Dietmar Rabich", "CC BY-SA 4.0", "M%C3%BCnster,_Roxel,_St.-Pantaleon-Kirche,_Fahrrad_--_2025_--_2696.jpg"),
  commons("ab01cc44f40745c15b43692c25c34545.webp", "Rear Rack", "Paul Sladen", "CC0", "Brompton-2017-rear-rack-guides-rollers-alpha.png"),
  commons("52a37caef0f546d23e100cd4743f1d1d.webp", "Multi-Tool 18-in-1", "Armchair", "CC BY-SA 3.0", "Bicycle_multi-tool.JPG"),
  commons("b02bb5428cc9c5752e0e34c15eb71a03.webp", "Hex Key Set", "Leon Brooks", "Public domain", "Set_of_eight_hex_allen_keys_on_ring_on_table.jpg"),
  commons("421db69ab0fdbb408eaa9191fae18af3.webp", "Torque Wrench", "J.C. Fields (Talk) (Uploads)", "CC BY-SA 3.0", "Craftsman_click_torque_wrench.jpg"),
  commons("3b40071cd4edece624fc71ea51a8efc1.webp", "Chain Tool", "Tiia Monto", "CC BY 4.0", "Chain_tool.png"),
  commons("06d9ac88a21f037ef3ea44460d88b6e5.webp", "Spoke Wrench", "FreeBSP", "CC BY-SA 3.0", "Key_for_spokes.png"),
  commons("40503e49b0b74caa5863537e565ee89c.webp", "Mini Pump", "Lord van Tasm", "CC BY-SA 3.0", "SKS-Germany_Tour_Pumps.jpg"),
  commons("c62afe9b2d26205d1123e23078c7c148.webp", "Cable Cutters", "Twotonetoo", "CC BY-SA 4.0", "Compound_action_wire_cutters.jpg"),
  commons("6599338f7577c0a4c3f26f83732e5b7f.webp", "Truing Stand", "Centrimaster", "CC BY-SA 3.0", "Wiki_Standard_wheel_holder.jpg"),
  commons("4af7bd8f122dd7f4a483a153fd1eb199.webp", "Saddle Bag", "Glory Cycles", "CC BY 2.0", "Spare_Seat_Bag_on_Cane_Creek_eeSilk_02.jpg"),
  commons("12af67f9e6777dfe41ed1c4afc5585ed.webp", "Pannier Pair", "Matti Blume", "CC BY-SA 4.0", "OutDoor_2018,_Friedrichshafen_(1X7A0503).jpg"),
  commons("85196c96f9ca16ee4640b68d9aede19d.webp", "Handlebar Bag", "jalexartis Photography from Fayetteville, NC, United States", "CC BY 2.0", "Build-up,_Step_Three_(3387876750).jpg"),
  commons("ce8e7a3ac0a249ee1161348ca7785d44.webp", "Frame Bag", "Robert Thomson", "CC BY-SA 2.0", "Mountain_bike_loaded_for_bikepacking_with_a_rear_rack_(cropped).jpg"),
  commons("00d409c1da9401e50493d6c2cb4e975f.webp", "Messenger Bag", "GV Students", "CC0", "FreitagBag.jpg"),
  commons("28bcc2911f3e43269f5e385907585459.webp", "Cycling Backpack 20L", "Matti Blume", "CC BY-SA 4.0", "Van_Rysel,_Cycling_World_Europe_2025,_Meerbusch_(P1045128).jpg"),
  commons("cb1d59922614c6aa811a9305319db049.webp", "City Commuter Bike", "Todd Fahrner", "CC BY-SA 2.0", "Dutch_bicycle_with_front_carrier_in_front_of_house.jpg"),
  commons("474f1c366993b714862a1ec734eba8db.webp", "Knee Pads", "Targje", "CC BY-SA 4.0", "Splav_tactical_knee_pads.jpg"),
  commons("14f9acc8068b17da3f9d12e7f7a2b486.webp", "Tubular Road Tire", "Glory Cycles", "CC BY 2.0", "Vittoria_Corsa_Speed_Tubular_-_2.jpg"),
  commons("cbec57e3955ac5fc2d84bc6d91f7d43a.webp", "Bike Wash Brush Set", "Unknown", "Public domain", "Brosse_epicier.jpg"),
  commons("97b9f4f875a99c729bec771ba4a33ba5.webp", "Water Bottle 750ml", "Atomic Taco from Seattle, WA, USA", "CC BY-SA 2.0", "RapidRide_water_bottle_(5042358699).jpg"),
  commons("30dee7421da0c3fa4af37f843b99430e.webp", "Phone Mount", "Voschix", "CC0", "2019-09-09_@_18-20-20_etrex%2BZ5_-P1030944.jpg"),
  commons("58c528c4ead8c4cedebaff36b5b4ad54.webp", "Cassette Lockring Tool", "Ian Harvey", "Public domain", "CassetteToolFitted.jpg"),
  commons("e9fadf9050b8c8973072735cb4dfa4b5.webp", "Bikepacking Seat Pack", "Htcltd", "CC BY-SA 4.0", "A_Bikepacking_Bike.jpg"),
  commons("fa2deb1e5ee64bb28a4dda8bb6f655c1.webp", "Waist Pack", "Plot Spoiler", "CC BY-SA 3.0", "Leather_Fanny_Pack.JPG"),
  photo("b1a74a1fba79ad0c4e645a9b5d89cf22.webp", "Bike Mirror", "sudoshift", "CC BY 2.0", "https://www.flickr.com/photos/64355762@N06/6180137072"),
  photo("33098dc7c0c5413dc1dd0d8576555fd4.webp", "Puncture Repair Kit", "JohnSeb", "CC BY 2.0", "https://www.flickr.com/photos/69875617@N00/4266571837"),
  photo("cb2c1ab295f9a1d7cb0c245d12acb26f.webp", "Degreaser 500ml", "londoncyclist", "CC BY 2.0", "https://www.flickr.com/photos/10978010@N07/15206974855"),
  photo("17d2e21ddd0aa6b79ef7a77811079441.webp", "Chain Checker", "UuMUfQ", "CC BY-SA 3.0", "https://commons.wikimedia.org/wiki/File:Bicycle_Chain_worn_out_different_length_det_e.png"),
  photo("285fbd4273238819dc7977994974d49a.webp", "Bike Computer", "Jun Seita", "CC BY 2.0", "https://www.flickr.com/photos/90454079@N00/5967670253"),
  photo("427499410e8a3bf41f961bff5d41610b.webp", "Bike Transport Bag", "Glory Cycles", "CC BY 2.0", "https://www.flickr.com/photos/29558127@N06/49056331887"),
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
  commons("615b84e311ad864c68189ad2cb9cdc5a.webp", "Bike Lights Night Clinic", "Jim.henderson", "CC0", "Lights_in_Heights_2009_jeh.jpg"),
  commons("576bbf8b57b377f1888694cefc375d22.webp", "Holiday Gift Repair Drive", "Timothy J Carroll", "CC BY 2.0", "Sopo_Bicycle_Cooperative.jpg"),
  commons("63b277ea96eeff00c5e9e216692a3d24.webp", "Winter Commuting 101", "Kristoffer Trolle from Copenhagen, Denmark", "CC BY 2.0", "Bicycles_in_Copenhagen_(50980998598).jpg"),
  commons("2cac706550623fcb8b1c02612aa23561.webp", "Fat Bike Snow Ride", "Matti Blume", "CC BY-SA 4.0", "OutDoor_2018,_Friedrichshafen_(1X7A0330).jpg"),
  commons("4a816f3bbbc77895b5a4f5c66e8a3f49.webp", "Wheel Truing Workshop", "Dietmar Rabich", "CC BY-SA 4.0", "M%C3%BCnster,_F%C3%BCrstbisch%C3%B6fliches_Schloss,_Fahrrad_am_Marstall_--_2022_--_0799.jpg"),
  commons("cff569d0dec3134127a12fb46ebc6eda.webp", "Women & Non-Binary Repair Night", "Kate Holt/AusAID", "CC BY 2.0", "Ben%27s_Bikes,_Namibia_(10676977646).jpg"),
  commons("7f9e433af35befbf1b9ddbbbcafb1306.webp", "Spring Tune-Up Day", "4300streetcar", "CC BY 4.0", "Tools_at_Somerville_Bike_Kitchen_2.jpg"),
  commons("fa54c9f08c201ae97f8d94243d2e13af.webp", "Used Bike Sale", "Jean-Pierre Bazard Jpbazard", "CC BY-SA 3.0", "Vente_du_poisson_p%C3%AAch%C3%A9_avec_le_fileyeur_Le_P%27tit_Jules_(24).JPG"),
  commons("3572b26057a9680c83dd640842a634e6.webp", "Lachine Canal Group Ride", "Guilhem Vellut from Annecy, France", "CC BY 2.0", "Canal_de_Lachine_@_Montr%C3%A9al_(29876056864).jpg"),
  commons("5d78146319233aa473fd8e3a894c2daf.webp", "Bike to Campus Week", "Karen Stintz from Toronto, Ontario, Canada", "CC BY 2.0", "Bike_to_Work_Day_(14174877608).jpg"),
];
