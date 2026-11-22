import { useEffect, useRef, useState } from "react";
import { api, errorMessage, formatAmount, type Item } from "../../services/api";
import { AddToCartButton, CartToast, ItemImage, StockLabel, useAddToCart } from "./addToCart";

export { stockStatus } from "./addToCart";

export const PAGE_SIZE = 10;

/** Case-insensitive match on name or category. */
export function matchesSearch(item: Item, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [item.name, item.category].some(text => (text || "").toLocaleLowerCase().includes(needle));
}

const plural = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;

export function ItemsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const cart = useAddToCart();
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    api<{ items: Item[] }>("/api/inventory")
      .then(result => { if (active) setItems(result.items); })
      .catch(reason => { if (active) setLoadError(errorMessage(reason)); });
    return () => { active = false; };
  }, []);

  function search(value: string) {
    setQuery(value);
    setPage(1); // a new search always starts on the first page
  }

  const matching = (items ?? []).filter(item => matchesSearch(item, query));
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const first = (current - 1) * PAGE_SIZE;
  const shown = matching.slice(first, first + PAGE_SIZE);

  return <div className="ev-page it-page">
    <header className="ev-header">
      <h1>Browse Items</h1>
      <p>Explore available bike parts and accessories. Search for items, check prices, and add products to your cart.</p>
    </header>

    <section className="ev-card it-card" aria-label="Items">
      <div className="it-toolbar">
        <div className="it-search">
          <SearchIcon className="it-search-icon" size={20} />
          <input ref={searchInput} type="search" aria-label="Search items by name or category" placeholder="Search items by name or category..."
            value={query} onChange={event => search(event.target.value)} />
          {query && <button type="button" className="it-clear" aria-label="Clear search" onClick={() => { search(""); searchInput.current?.focus(); }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>}
        </div>
        {items && <p className="it-count" role="status" aria-live="polite">{plural(matching.length)}</p>}
      </div>

      {loadError ? <p className="ev-alert it-message" role="alert">Could not load items: {loadError}</p>
        : !items ? <p className="it-message ev-muted" role="status">Loading items…</p>
        : !matching.length ? <div className="it-empty">
          <span className="it-empty-icon"><SearchIcon size={26} /></span>
          <h2>No items found</h2>
          <p>{query.trim() ? <>No items match “{query.trim()}”. Try a different name or category.</> : "There are no items available right now."}</p>
          {query && <button type="button" className="it-secondary" onClick={() => { search(""); searchInput.current?.focus(); }}>Clear search</button>}
        </div>
        : <ul className="it-list">{shown.map(item => {
          const held = cart.inCart[item.item_id] ?? 0;
          return <li key={item.item_id} className="it-row">
            <ItemImage src={item.image_path} />
            <div className="it-info">
              <h2 className="it-name"><a href={`item.html?id=${item.item_id}`}>{item.name}</a></h2>
              {item.description && <p className="it-desc">{item.description}</p>}
              <p className="it-meta">
                <StockLabel stock={item.stock_quantity} />
                {item.category && <><span aria-hidden="true">·</span><span>{item.category}</span></>}
                {held > 0 && <><span aria-hidden="true">·</span><span>{held} in your cart</span></>}
              </p>
            </div>
            <div className="it-side">
              <p className="it-price">{formatAmount(item.price)}</p>
              <AddToCartButton item={item} cart={cart} />
            </div>
          </li>;
        })}</ul>}
    </section>

    {matching.length > 0 && <nav className="it-pager" aria-label="Item pages">
      <p className="it-range">Showing {first + 1}–{first + shown.length} of {plural(matching.length)}</p>
      <div className="it-pager-controls">
        <button type="button" className="it-page-btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>Previous
        </button>
        <span className="it-page" aria-current="page">Page {current} of {pageCount}</span>
        <button type="button" className="it-page-btn it-page-next" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
          Next<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </nav>}

    <CartToast toast={cart.toast} />
  </div>;
}

function SearchIcon({ size, className }: { size: number; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
}
