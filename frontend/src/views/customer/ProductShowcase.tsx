import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api, formatAmount, type Item } from "../../services/api";
import { AddToCartButton, CartToast, StockLabel, stockStatus, useAddToCart } from "./addToCart";

/** How long each slide stays up while playing (also drives the progress bar). */
export const SLIDE_MS = 6000;
/** After the visitor picks a slide, autoplay waits this long before carrying on. */
export const RESUME_MS = 10000;
const MAX_SLIDES = 8;

/** Home page slideshow that loops through in-stock products that have a photo. */
export function ProductShowcase() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [index, setIndex] = useState(0);
  // Always plays (no play/pause button). It holds while hovered, while a control has keyboard
  // focus, and for RESUME_MS after the visitor picks a slide. `picks` counts picks so each one
  // restarts the resume timer; 0 means not held.
  const [picks, setPicks] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const cart = useAddToCart();
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    api<{ items: Item[] }>("/api/inventory").then(result => {
      if (active) setItems(result.items.filter(item => item.image_path && stockStatus(item.stock_quantity).tone !== "out").slice(0, MAX_SLIDES));
    }).catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  const count = items?.length ?? 0;
  const running = !picks && !hovered && !focused && count > 1;
  // A visitor-chosen slide: show it and hold autoplay.
  const go = (next: number) => { setIndex((next + count) % count); setPicks(n => n + 1); };

  useEffect(() => {
    if (!picks) return;
    const timer = setTimeout(() => setPicks(0), RESUME_MS);
    return () => clearTimeout(timer);
  }, [picks]);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setIndex(current => (current + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [running, index, count]);

  if (!items?.length) return null; // nothing to feature (or still loading)

  function onPointerUp(event: PointerEvent) {
    if (swipeStart.current === null) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) > 50) go(index + (distance < 0 ? 1 : -1));
  }

  return <section className="card sc" aria-roledescription="carousel" aria-label="Featured products"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={event => { if (event.target.matches(":focus-visible")) setFocused(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}
    onKeyDown={event => {
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    }}>
    <div className="sc-head">
      <div><p className="sc-kicker">Featured products</p><h2>From our shop floor</h2></div>
      <div className="sc-controls">
        <button type="button" className="sc-btn" aria-label="Previous product" onClick={() => go(index - 1)}>‹</button>
        <button type="button" className="sc-btn" aria-label="Next product" onClick={() => go(index + 1)}>›</button>
      </div>
    </div>
    <div className="sc-track" aria-live={running ? "off" : "polite"}
      onPointerDown={event => { if (event.pointerType !== "mouse") swipeStart.current = event.clientX; }}
      onPointerUp={onPointerUp} onPointerCancel={() => { swipeStart.current = null; }}>
      {items.map((item, slide) => {
        const active = slide === index;
        return <div key={item.item_id} className={`sc-slide${active ? " is-active" : ""}`} role="group" aria-roledescription="slide"
          aria-label={`${slide + 1} of ${count}: ${item.name}`} aria-hidden={!active} inert={!active}>
          <div className="sc-copy">
            <p className="sc-anim sc-meta">{[item.category, item.brand].filter(Boolean).join(" · ")}</p>
            <h3 className="sc-anim sc-name">{item.name}</h3>
            {item.description && <p className="sc-anim sc-desc">{item.description}</p>}
            <p className="sc-anim sc-price"><strong>{formatAmount(item.price)}</strong> <StockLabel stock={item.stock_quantity} /></p>
            <div className="sc-anim sc-actions">
              <AddToCartButton item={item} cart={cart} />
              <a className="sc-more" href={`item.html?id=${item.item_id}`}>View details</a>
            </div>
          </div>
          <div className="sc-visual"><img src={item.image_path!} alt="" /></div>
        </div>;
      })}
    </div>
    <div className="sc-dots">
      {items.map((item, slide) => <button key={item.item_id} type="button" className={`sc-dot${slide === index ? " is-active" : ""}`}
        aria-label={`Show ${item.name}`} aria-current={slide === index ? "true" : undefined} onClick={() => go(slide)}>
        {slide === index && <span key={index} className="sc-dot-fill" style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? "running" : "paused" }} />}
      </button>)}
    </div>
    <CartToast toast={cart.toast} />
  </section>;
}
