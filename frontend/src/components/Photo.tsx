import type { CSSProperties } from "react";

export const PHOTO_DIR = "/assets/images/lpvr";

/** Inline style that hands a photo to the CSS fade effects (.photo-hero, .photo-footer, .card-photo). */
export function photoStyle(name: string): CSSProperties {
  return { "--photo": `url("${PHOTO_DIR}/${name}.webp")` } as CSSProperties;
}

/**
 * Decorative card photo that fades into the card.
 * "strip" spans the top of the card; "corner" sits top-right behind the heading, so it needs
 * only about 60% of the card's width in real pixels (good for photos under ~2000px wide).
 */
export function PhotoBand({ name, credit, layout = "strip" }: { name: string; credit?: string; layout?: "strip" | "corner" }) {
  return <div className={layout === "corner" ? "card-photo card-photo--corner" : "card-photo"} style={photoStyle(name)} aria-hidden={credit ? undefined : true}>
    {credit && <span className="photo-credit">{credit}</span>}
  </div>;
}
