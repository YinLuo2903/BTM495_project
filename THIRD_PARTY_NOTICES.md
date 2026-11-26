# Third-party notices

The source code in this repository is released under the [MIT License](LICENSE).
The MIT License covers only work owned by the project's authors. The files below
belong to other people and keep their own terms. They are **not** covered by the
MIT License; anyone reusing this project must follow the terms listed here or
remove the files.

The website shows these credits to visitors on its **Photo credits** page
(`/views/customer/credits.html`, linked from the footer). That page reads from
[`frontend/src/views/customer/credits.ts`](frontend/src/views/customer/credits.ts),
the one list of credits, which a test checks against the image folders.

## Le Petit Vélo Rouge: logo and shop photos

© Le Petit Vélo Rouge. All rights reserved. Used for this class project, which
builds a website for the shop. Not licensed for reuse.

| File | Source |
| --- | --- |
| `frontend/assets/images/logo.png` | LPVR logo |
| `frontend/assets/images/lpvr/hero-workshop.webp` | [Instagram post](https://www.instagram.com/p/ClC4A5Ss5IZ/) |
| `frontend/assets/images/lpvr/band-events.webp` | [Instagram post](https://www.instagram.com/p/Cw5lMh-rnpj/) |
| `frontend/assets/images/lpvr/band-items.webp` | [Instagram post](https://www.instagram.com/p/C6zJ-BhgTto/) |
| `frontend/assets/images/lpvr/band-appointments.webp` | [Instagram post](https://www.instagram.com/p/CqD7WyJp_uU/) |
| `frontend/assets/images/lpvr/band-inventory.webp` | [Instagram post](https://www.instagram.com/p/Cz-HKsEswIB/) |
| `frontend/assets/images/lpvr/footer-team.webp` | [Instagram post](https://www.instagram.com/p/C0pYwMXA5pU/) |

## The Link: article photos

© Ivan de Jacquelin / The Link. All rights reserved. From
[“Le Petit Vélo Rouge: The Loyola Campus’ Fix-It-Yourself Atelier”](https://thelinknewspaper.ca/article/le-petit-velo-rouge-the-loyola-campus-fix-it-yourself-atelier)
(September 13, 2022). Credited next to the photo wherever it appears. Not licensed for reuse.

| File | Photo |
| --- | --- |
| `frontend/assets/images/lpvr/header-tool-wall.webp` | Tools available at Le Petit Vélo Rouge |
| `frontend/assets/images/lpvr/band-orders.webp` | Le Petit Vélo Rouge entrance by the Oscar Peterson parking lot |

## Wikimedia Commons: sample item and event photos

`database/Mockdata/images/*.webp`: photos for the sample items and events, from Wikimedia
Commons under Creative Commons licenses (CC BY 2.0, CC BY-SA 2.0/3.0/4.0, CC0) or in the
public domain; cropped, resized and converted to WebP. Each photo's author, license and
source page are listed in `frontend/src/views/customer/credits.ts` and on the site's
Photo credits page. The CC BY-SA photos as modified here are shared under the same
licenses as the originals.

## Software dependencies

npm packages (React, Vite, Vitest, Testing Library and others in
`frontend/package.json`) are installed by `npm ci` and are not stored in this
repository. Each package keeps its own license; see `frontend/node_modules/<package>/LICENSE`
after installing. The backend uses only the Python standard library.

## Fonts

`frontend/assets/fonts/barlow-condensed-800-latin.woff2`: Barlow Condensed ExtraBold,
Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow), licensed under the
SIL Open Font License 1.1. The license text is in
[`frontend/assets/fonts/OFL.txt`](frontend/assets/fonts/OFL.txt). Used for the wordmark in the
menu bar; it is stored in the repository so the site does not load fonts from Google.
