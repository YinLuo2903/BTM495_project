import { Brand } from "../../components/Brand";
import { photoStyle } from "../../components/Photo";
import { EVENT_CREDITS, PRODUCT_CREDITS, SITE_CREDITS, type PhotoCredit } from "./credits";

function CreditTile({ credit }: { credit: PhotoCredit }) {
  const openLicense = credit.license.startsWith("CC");
  return <li className="credit-tile">
    <a className="credit-thumb" href={credit.source} target="_blank" rel="noreferrer" aria-label={`${credit.subject}: open the original`}>
      <img src={credit.src} alt="" loading="lazy" className={credit.file === "logo.png" ? "credit-thumb-logo" : undefined} />
    </a>
    <div className="credit-body">
      <strong>{credit.subject}</strong>
      <span className="credit-author">by <a href={credit.source} target="_blank" rel="noreferrer">{credit.author}</a></span>
      {credit.licenseUrl
        ? <a className={`credit-license${openLicense ? " is-open" : ""}`} href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a>
        : <span className="credit-license">{credit.license}</span>}
    </div>
  </li>;
}

const COMMONS_NOTE = "Sample photos from Wikimedia Commons, cropped and resized for this site. Photos under CC BY-SA licenses are shared here under the same license.";

function CreditSection({ title, note, credits }: { title: string; note: string; credits: PhotoCredit[] }) {
  return <section className="card credit-section">
    <h2>{title}</h2>
    <p className="muted">{note}</p>
    <ul className="credit-grid">{credits.map(credit => <CreditTile key={credit.file} credit={credit} />)}</ul>
  </section>;
}

/** credits.html: who took the photos on this site and under which terms. */
export function CreditsPage() {
  return <>
    <header className="header customer-welcome photo-hero" style={photoStyle("band-inventory")}>
      <div><Brand large /><h1>Photo credits</h1>
        <p className="subtitle">The people behind the pictures on this site. The website's code is released under the MIT License;
          every photo and the logo keep their own terms, listed below.</p>
        <ul className="credit-summary">
          <li><strong>MIT</strong> site code</li>
          <li><strong>{SITE_CREDITS.length}</strong> shop images</li>
          <li><strong>{PRODUCT_CREDITS.length + EVENT_CREDITS.length}</strong> product &amp; event photos</li>
        </ul></div>
    </header>
    <CreditSection title="From the shop" credits={SITE_CREDITS}
      note="The logo and shop photos belong to Le Petit Vélo Rouge; two photos are from The Link's 2022 article about the shop." />
    <CreditSection title="Product photos" credits={PRODUCT_CREDITS} note={COMMONS_NOTE} />
    <CreditSection title="Event photos" credits={EVENT_CREDITS} note={COMMONS_NOTE} />
  </>;
}
