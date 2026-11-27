import { useEffect, useState } from "react";
import { Slideshow } from "../../components/Slideshow";
import { api, formatAmount, type Item } from "../../services/api";
import { AddToCartButton, CartToast, StockLabel, stockStatus, useAddToCart } from "./addToCart";

export { RESUME_MS, SLIDE_MS } from "../../components/Slideshow";
const MAX_SLIDES = 8;

/** Home page slideshow that loops through in-stock products that have a photo. */
export function ProductShowcase() {
  const [items, setItems] = useState<Item[]>([]);
  const cart = useAddToCart();

  useEffect(() => {
    let active = true;
    api<{ items: Item[] }>("/api/inventory").then(result => {
      if (active) setItems(result.items.filter(item => item.image_path && stockStatus(item.stock_quantity).tone !== "out").slice(0, MAX_SLIDES));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  return <Slideshow label="Featured products" kicker="Featured products" title="From our shop floor" noun="product"
    slides={items.map(item => ({
      key: item.item_id, name: item.name, content: <>
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
      </>,
    }))}>
    <CartToast toast={cart.toast} />
  </Slideshow>;
}
