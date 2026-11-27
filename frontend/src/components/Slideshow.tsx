import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** How long each slide stays up while playing (also drives the progress bar). */
export const SLIDE_MS = 5000;
/** After the visitor picks a slide, autoplay waits this long before carrying on. */
export const RESUME_MS = 10000;

type Dir = "next" | "prev";

/**
 * Playback for an auto-advancing set of slides; the caller owns the current index.
 * It always plays (there is no play/pause button), holding while hovered, while a control has
 * keyboard focus, and for RESUME_MS after the visitor picks a slide. Slides move with the
 * classes from `slideClass` (css/showcase.css): the new one pushes in, the old one slides out.
 */
export function useSlideshow({ count, index, onChange, next = i => (i + 1) % count, autoplay = true }: {
  count: number;
  /** Current slide, or -1 when the shown item is not one of the slides (autoplay then waits). */
  index: number;
  onChange: (index: number) => void;
  /** Which slide autoplay moves to next (default: the following one, wrapping around). */
  next?: (index: number) => number;
  autoplay?: boolean;
}) {
  // The slide that is sliding out, and which way: "next" moves left, "prev" moves right.
  const [leaving, setLeaving] = useState<{ slide: number; dir: Dir } | null>(null);
  // Counts the visitor's picks so each one restarts the resume timer; 0 means not held.
  const [picks, setPicks] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const swipeStart = useRef<number | null>(null);
  const running = autoplay && index >= 0 && !picks && !hovered && !focused && count > 1;

  const show = (target: number, dir: Dir) => {
    if (target === index || target < 0 || target >= count) return;
    if (index >= 0) setLeaving({ slide: index, dir });
    onChange(target);
  };
  /** A visitor-chosen slide: show it and hold autoplay for a while. */
  const go = (target: number) => {
    show((target + count) % count, target < index ? "prev" : "next");
    setPicks(n => n + 1);
  };

  useEffect(() => {
    if (!picks) return;
    const timer = setTimeout(() => setPicks(0), RESUME_MS);
    return () => clearTimeout(timer);
  }, [picks]);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => show(next(index), "next"), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [running, index, count]);

  return {
    running, go,
    /** Classes for slide n: entering, leaving, or hidden. */
    slideClass: (n: number) => {
      const dir = leaving?.dir ?? "next";
      return `sc-slide${n === index ? ` is-active sc-from-${dir}` : leaving?.slide === n ? ` is-leaving sc-to-${dir}` : ""}`;
    },
    /** Spread on the element that holds the controls: pause on hover/focus, arrow keys. */
    holder: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: (event: FocusEvent) => { if ((event.target as Element).matches(":focus-visible")) setFocused(true); },
      onBlur: (event: FocusEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); },
      onKeyDown: (event: KeyboardEvent) => {
        if ((event.target as Element).matches("input, select, textarea")) return;
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      },
    },
    /** Spread on the slide track: swipe left/right on touch screens. */
    swipe: {
      onPointerDown: (event: PointerEvent) => { if (event.pointerType !== "mouse") swipeStart.current = event.clientX; },
      onPointerUp: (event: PointerEvent) => {
        if (swipeStart.current === null) return;
        const distance = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(distance) > 50) go(index + (distance < 0 ? 1 : -1));
      },
      onPointerCancel: () => { swipeStart.current = null; },
    },
  };
}

/** Progress bar inside the current dot, timed to the autoplay. */
export function DotFill({ running }: { running: boolean }) {
  return <span className="sc-dot-fill" style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? "running" : "paused" }} />;
}

export interface Slide {
  key: string | number;
  /** Name read out for the slide and its dot, e.g. the product or event name. */
  name: string;
  content: ReactNode;
}

/** Card with a heading, arrows, sliding slides and dots; used on the home page. */
export function Slideshow({ label, kicker, title, noun, slides, children }: {
  label: string; kicker: string; title: string;
  /** Used in the arrow labels: "Previous product", "Next event". */
  noun: string;
  slides: Slide[];
  /** Extra content below the dots (a link, a toast). */
  children?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const show = useSlideshow({ count, index, onChange: setIndex });
  if (!count) return null; // nothing to show (or still loading)

  return <section className="card sc" aria-roledescription="carousel" aria-label={label} {...show.holder}>
    <div className="sc-head">
      <div><p className="sc-kicker">{kicker}</p><h2>{title}</h2></div>
      <div className="sc-controls">
        <button type="button" className="sc-btn" aria-label={`Previous ${noun}`} onClick={() => show.go(index - 1)}>‹</button>
        <button type="button" className="sc-btn" aria-label={`Next ${noun}`} onClick={() => show.go(index + 1)}>›</button>
      </div>
    </div>
    <div className="sc-track" aria-live={show.running ? "off" : "polite"} {...show.swipe}>
      {slides.map((slide, n) => <div key={slide.key} className={show.slideClass(n)} role="group" aria-roledescription="slide"
        aria-label={`${n + 1} of ${count}: ${slide.name}`} aria-hidden={n !== index} inert={n !== index}>{slide.content}</div>)}
    </div>
    <div className="sc-dots">
      {slides.map((slide, n) => <button key={slide.key} type="button" className={`sc-dot${n === index ? " is-active" : ""}`}
        aria-label={`Show ${slide.name}`} aria-current={n === index ? "true" : undefined} onClick={() => show.go(n)}>
        {n === index && <DotFill key={index} running={show.running} />}
      </button>)}
    </div>
    {children}
  </section>;
}
