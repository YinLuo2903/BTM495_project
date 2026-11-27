import { useEffect, useState } from "react";
import { Slideshow } from "../../components/Slideshow";
import { api, type ShopEvent } from "../../services/api";
import { upcomingEvents } from "./EventsPage";

const MAX_SLIDES = 8;

/** Home page slideshow of the next open events, soonest first. */
export function EventShowcase() {
  const [events, setEvents] = useState<ReturnType<typeof upcomingEvents>>([]);

  useEffect(() => {
    let active = true;
    api<{ events: ShopEvent[] }>("/api/events")
      .then(result => { if (active) setEvents(upcomingEvents(result.events).slice(0, MAX_SLIDES)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return <Slideshow label="Upcoming events" kicker="Upcoming events" title="Ride, learn and fix together" noun="event"
    slides={events.map(event => {
      const spots = event.participant_limit - event.customer_ids.length;
      return {
        key: event.event_id, name: event.name, content: <>
          <div className="sc-copy">
            <p className="sc-anim sc-meta">{event.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {" · "}{event.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              {event.location && ` · ${event.location}`}</p>
            <h3 className="sc-anim sc-name">{event.name}</h3>
            {event.description && <p className="sc-anim sc-desc">{event.description}</p>}
            <p className="sc-anim sc-price"><span className={`it-stock it-stock-${spots > 0 ? "in" : "out"}`}>{spots > 0 ? `${spots} spots left` : "Full"}</span></p>
            <div className="sc-anim sc-actions">
              <a className="sc-cta" href={`events.html?id=${event.event_id}`}>{spots > 0 ? "Register" : "View event"}</a>
              <a className="sc-more" href="events.html">All events</a>
            </div>
          </div>
          <div className="sc-visual">{event.image_path && <img src={event.image_path} alt="" />}</div>
        </>,
      };
    })} />;
}
