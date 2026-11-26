/** Logo + stacked wordmark ("LE PETIT" over "VÉLO ROUGE"), used in the menu bar and page banners. */
export function Brand({ large = false }: { large?: boolean }) {
  return <span className={large ? "brand brand-lg" : "brand"} role="img" aria-label="LE PETIT VÉLO ROUGE">
    <img src="/assets/images/logo.png" alt="" className="brand-logo" />
    <span className="brand-words">
      <span className="brand-small">LE PETIT</span>
      <span className="brand-big">VÉLO <span>ROUGE</span></span>
    </span>
  </span>;
}
