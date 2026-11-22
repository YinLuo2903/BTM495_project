import { useEffect, useState } from "react";
import { api, errorMessage, formatAmount, type Item } from "../../services/api";
import { AddToCartButton, CartToast, ItemImage, StockLabel, useAddToCart } from "./addToCart";

const VALID_ID = /^[1-9]\d*$/;

/** item.html?id=N: one item with its own Add to Cart, sharing the cart logic of the items list. */
export function ItemDetailPage() {
  const id = new URLSearchParams(location.search).get("id");
  const validId = Boolean(id && VALID_ID.test(id));
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const cart = useAddToCart();

  useEffect(() => {
    if (!validId) return;
    let active = true;
    api<{ items: Item[] }>("/api/inventory")
      .then(result => { if (active) setItems(result.items); })
      .catch(reason => { if (active) setLoadError(errorMessage(reason)); });
    return () => { active = false; };
  }, [validId]);

  const item = items?.find(value => String(value.item_id) === id);
  const held = item ? cart.inCart[item.item_id] ?? 0 : 0;
  const notice = !validId ? "Choose an item from the items page."
    : loadError ? `Could not load the item: ${loadError}`
    : !items ? "Loading item…"
    : !item ? "Item not found."
    : "";

  return <div className="ev-page it-page">
    <p className="it-back"><a href="items.html">← Back to items</a></p>
    {notice ? <section className="ev-card it-detail-notice">
      <p role={loadError ? "alert" : "status"} className={loadError ? "ev-alert" : undefined}>{notice}</p>
    </section>
    : item && <article className="ev-card it-detail">
      <ItemImage size={64} src={item.image_path} />
      <div className="it-detail-body">
        {item.category && <p className="it-detail-category">{item.category}</p>}
        <h1>{item.name}</h1>
        {item.brand && <p className="it-detail-brand">by {item.brand}</p>}
        <p className="it-detail-desc">{item.description || "No description available."}</p>
        <p className="it-meta">
          <StockLabel stock={item.stock_quantity} />
          {held > 0 && <><span aria-hidden="true">·</span><span>{held} in your cart</span></>}
        </p>
        <p className="it-detail-price">{formatAmount(item.price)}</p>
        <div className="it-detail-actions">
          <AddToCartButton item={item} cart={cart} />
          <a href="cart.html">View shopping cart</a>
        </div>
      </div>
    </article>}
    <CartToast toast={cart.toast} />
  </div>;
}
