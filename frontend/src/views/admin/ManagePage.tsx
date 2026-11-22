import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { errorMessage } from "../../services/api";
import { imageFileError, uploadImage } from "../../services/admin";
import { EDITABLE, PAGE_SIZE, type Cell, type Errors, type FieldDef, type Form, type ModuleConfig } from "./adminModules";
import { CheckIcon, CloseIcon, DeleteIcon, EditIcon, ImageIcon, PlusIcon, SearchIcon, UploadIcon, ViewIcon } from "./icons";

interface Panel {
  mode: "view" | "edit" | "new";
  id: number | null;
  form: Form;
  errors: Errors;
  confirming: boolean;
  busy: boolean;
  error: string;
}

/** The shared management table for one module, with its right-side details panel. */
export function ManagePage<T>({ config }: { config: ModuleConfig<T> }) {
  const editable = EDITABLE.includes(config.key) && Boolean(config.editor);
  const [rows, setRows] = useState<T[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState(config.defaultSort);
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openedFromLink = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await config.load();
      setRows(data);
      setLoadError("");
      return data;
    } catch (reason) {
      setLoadError(errorMessage(reason));
      return null;
    }
  }, [config]);

  useEffect(() => {
    void load().then(data => {
      // Links such as events.html?id=3 (from the dashboard) open that record.
      const id = Number(new URLSearchParams(window.location.search).get("id"));
      if (data && id && !openedFromLink.current && data.some(row => config.id(row) === id)) {
        openedFromLink.current = true;
        open(data.find(row => config.id(row) === id)!, "view");
      }
    });
    return () => clearTimeout(toastTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  function showToast(message: string) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(row => !q || config.searchText(row).toLowerCase().includes(q));
  }, [rows, search, config]);
  const activeFilter = config.filters.find(f => f.label === filter) ?? config.filters[0];
  const sorted = useMemo(() => {
    const column = config.columns[sort.column];
    const filtered = activeFilter ? searched.filter(activeFilter.test) : searched;
    return filtered.slice().sort((a, b) => {
      const x = column.sortValue(a), y = column.sortValue(b);
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return (sort.dir === "asc" ? order : -order) || config.id(a) - config.id(b);
    });
  }, [searched, activeFilter, sort, config]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const record = panel && panel.id != null ? rows?.find(row => config.id(row) === panel.id) ?? null : null;

  function open(row: T, mode: "view" | "edit" | "delete") {
    setPanel({
      mode: mode === "edit" && editable ? "edit" : "view", id: config.id(row),
      form: config.editor ? config.editor.toForm(row) : {}, errors: {}, confirming: mode === "delete", busy: false, error: "",
    });
  }

  function openNew() {
    if (!config.editor) return;
    setPanel({ mode: "new", id: null, form: config.editor.blank(), errors: {}, confirming: false, busy: false, error: "" });
  }

  function setField(key: string, value: string) {
    setPanel(current => current && {
      ...current, form: { ...current.form, [key]: value }, errors: { ...current.errors, [key]: "" },
    });
  }

  function setFieldError(key: string, message: string) {
    setPanel(current => current && { ...current, errors: { ...current.errors, [key]: message } });
  }

  async function save() {
    if (!panel || !config.editor || panel.busy) return;
    const errors = config.editor.validate(panel.form, record);
    if (Object.values(errors).some(Boolean)) {
      setPanel({ ...panel, errors });
      const first = config.editor.fields.find(f => errors[f.key]);
      if (first) setTimeout(() => document.getElementById(`adm-field-${first.key}`)?.focus(), 0);
      return;
    }
    setPanel({ ...panel, busy: true, error: "" });
    try {
      let id = panel.id;
      let message = "Changes saved.";
      if (panel.mode === "new") {
        id = await config.editor.create(panel.form);
        message = `New ${config.singular} created.`;
      } else if (record && !(await config.editor.update(record, panel.form))) {
        message = "No changes to save.";
      }
      const data = await load();
      const saved = data?.find(row => config.id(row) === id);
      setPanel(saved ? { mode: "view", id, form: config.editor.toForm(saved), errors: {}, confirming: false, busy: false, error: "" } : null);
      showToast(message);
    } catch (reason) {
      setPanel(current => current && { ...current, busy: false, error: errorMessage(reason) });
    }
  }

  async function remove() {
    if (!panel || !record || panel.busy) return;
    setPanel({ ...panel, busy: true, error: "" });
    try {
      await config.remove(record);
      const name = config.name(record);
      setPanel(null);
      await load();
      showToast(`${name} deleted.`);
    } catch (reason) {
      setPanel(current => current && { ...current, busy: false, error: errorMessage(reason) });
    }
  }

  function cancelEdit() {
    if (!panel) return;
    if (panel.mode === "new" || !record) setPanel(null);
    else setPanel({ ...panel, mode: "view", form: config.editor ? config.editor.toForm(record) : {}, errors: {}, error: "" });
  }

  return <>
    <div className="adm-head">
      <div><h1>{config.title}</h1><p>{config.subtitle}</p></div>
      {editable && <button type="button" className="adm-btn adm-btn-primary" onClick={openNew}><PlusIcon />Add New</button>}
    </div>

    {loadError && <div className="adm-alert" role="alert">{loadError} <button type="button" className="adm-text-btn" onClick={() => void load()}>Retry</button></div>}

    <section className={`adm-card adm-g-${config.key}`} aria-label={`${config.title} records`}>
      <div className="adm-toolbar">
        <div className="adm-search">
          <label className="adm-sr-only" htmlFor="adm-search">Search {config.title.toLowerCase()}</label>
          <SearchIcon />
          <input id="adm-search" type="search" placeholder={config.searchHint} value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </div>
        {config.filters.length > 0 && <div className="adm-pills" role="group" aria-label={config.filterLabel}>
          {config.filters.map(f => <button key={f.label} type="button" className="adm-pill" aria-pressed={f === activeFilter}
            onClick={() => { setFilter(f.label); setPage(1); }}>
            {f.label}<span className="adm-pill-count">{searched.filter(f.test).length}</span>
          </button>)}
        </div>}
        <span className="adm-sort-note">Sorted by {config.columns[sort.column].label} ({sort.dir === "asc" ? "ascending" : "descending"})</span>
      </div>

      <div className="adm-tbl-wrap">
        <div className="adm-tbl" role="table" aria-label={config.title} aria-busy={rows === null || undefined}>
          <div className="adm-tr adm-th-row" role="row">
            {config.columns.map((column, index) => <div key={column.label} className="adm-th" role="columnheader"
              aria-sort={index === sort.column ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
              <button type="button" className="adm-th-btn" onClick={() => {
                setSort(index === sort.column ? { column: index, dir: sort.dir === "asc" ? "desc" : "asc" } : { column: index, dir: "asc" });
                setPage(1);
              }}>
                {column.label}<span className="adm-th-arrow" aria-hidden="true">{index === sort.column ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
              </button>
            </div>)}
            <div className="adm-th" role="columnheader" style={{ justifyContent: "flex-end" }}>Actions</div>
          </div>
          {visible.map(row => {
            const name = config.name(row);
            return <div key={config.id(row)} className="adm-tr" role="row">
              {config.columns.map(column => <div key={column.label} className="adm-td" role="cell">
                <TableCell cell={column.cell(row)} onOpen={() => open(row, "view")} />
              </div>)}
              <div className="adm-td adm-actions" role="cell">
                <button type="button" className="adm-icon-btn" aria-label={`View ${name}`} title="View" onClick={() => open(row, "view")}><ViewIcon /></button>
                {editable && <button type="button" className="adm-icon-btn" aria-label={`Edit ${name}`} title="Edit" onClick={() => open(row, "edit")}><EditIcon /></button>}
                <button type="button" className="adm-icon-btn adm-del" aria-label={`Delete ${name}`} title="Delete" onClick={() => open(row, "delete")}><DeleteIcon /></button>
              </div>
            </div>;
          })}
        </div>
      </div>
      {rows === null && !loadError && <p className="adm-empty" role="status">Loading {config.title.toLowerCase()}…</p>}
      {rows !== null && visible.length === 0 && <div className="adm-empty">
        <strong>No {config.title.toLowerCase()} found</strong>
        {rows.length ? "Try a different search or filter." : `There are no ${config.title.toLowerCase()} yet.`}
      </div>}
      <div className="adm-foot">
        <span>{sorted.length ? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, sorted.length)} of ${sorted.length} ${config.title.toLowerCase()}` : `Showing 0 ${config.title.toLowerCase()}`}</span>
        <nav className="adm-pager" aria-label="Pagination">
          <button type="button" className="adm-pg" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</button>
          {Array.from({ length: pages }, (_, index) => index + 1).map(n => <button key={n} type="button" className="adm-pg"
            aria-label={`Page ${n}`} aria-current={n === currentPage ? "page" : undefined} onClick={() => setPage(n)}>{n}</button>)}
          <button type="button" className="adm-pg" aria-label="Next page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>›</button>
        </nav>
      </div>
    </section>

    {panel && (panel.mode === "new" || record) && <DetailsPanel
      config={config} record={record} panel={panel} editable={editable}
      onClose={() => setPanel(null)} onEdit={() => setPanel({ ...panel, mode: "edit", confirming: false, errors: {}, error: "" })}
      onCancelEdit={cancelEdit} onSave={() => void save()} onAskDelete={() => setPanel({ ...panel, confirming: true, error: "" })}
      onCancelDelete={() => setPanel({ ...panel, confirming: false })} onDelete={() => void remove()}
      onField={setField} onFieldError={setFieldError}
    />}
    {toast && <div className="adm-toast" role="status"><CheckIcon />{toast}</div>}
  </>;
}

function TableCell({ cell, onOpen }: { cell: Cell; onOpen: () => void }) {
  if (cell.kind === "primary") {
    return <span className="adm-name-cell">
      {cell.thumb !== undefined && (cell.thumb
        ? <img className="adm-thumb" src={cell.thumb} alt="" />
        : <span className="adm-thumb adm-thumb-empty" aria-hidden="true"><ImageIcon size={20} /></span>)}
      <button type="button" className="adm-link-btn" onClick={onOpen}>{cell.text}</button>
    </span>;
  }
  if (cell.kind === "badge") return <span className={`adm-badge ${cell.badge ?? ""}`}>{cell.text}</span>;
  return <span className={cell.kind === "muted" ? "adm-muted" : undefined}>{cell.text}</span>;
}

interface PanelProps<T> {
  config: ModuleConfig<T>;
  record: T | null;
  panel: Panel;
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onField: (key: string, value: string) => void;
  onFieldError: (key: string, message: string) => void;
}

function DetailsPanel<T>(props: PanelProps<T>) {
  const { config, record, panel, editable, onClose } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const isForm = panel.mode !== "view";
  const block = record && config.blockDelete ? config.blockDelete(record) : "";
  const singular = config.singular.charAt(0).toUpperCase() + config.singular.slice(1);
  const image = record && config.image ? config.image(record) : undefined;

  useEffect(() => { heading.current?.focus(); }, [panel.mode, panel.id]);

  return <>
    <div className="adm-scrim" aria-hidden="true" onClick={onClose} />
    <aside className="adm-panel" role="dialog" aria-modal="true" aria-labelledby="adm-panel-title"
      onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <div className="adm-panel-head">
        <div>
          <div className="adm-panel-kicker">{panel.mode === "new" ? "Add New" : panel.mode === "edit" ? "Edit details" : `${singular} details`}</div>
          <h2 id="adm-panel-title" ref={heading} tabIndex={-1}>{record ? config.name(record) : `New ${config.singular}`}</h2>
          <div className="adm-panel-table">Database: <code>{config.table}</code></div>
        </div>
        <button type="button" className="adm-icon-btn" aria-label="Close details" onClick={onClose}><CloseIcon /></button>
      </div>

      <div className="adm-panel-body">
        {panel.error && <p className="adm-alert" role="alert">{panel.error}</p>}
        {!isForm && record && <>
          {image !== undefined && (image
            ? <img className="adm-detail-img" src={image} alt={`Image of ${config.name(record)}`} />
            : <div className="adm-detail-img-empty"><ImageIcon size={28} />No image yet</div>)}
          <dl className="adm-dl">
            {config.details(record).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {panel.confirming && <div className="adm-confirm" role="alertdialog" aria-labelledby="adm-confirm-title" aria-describedby="adm-confirm-text">
            <h3 id="adm-confirm-title">{block ? "This record can’t be deleted" : `Delete ${config.name(record)}?`}</h3>
            <p id="adm-confirm-text">{block || `${config.deleteText(record)} This can’t be undone.`}</p>
            <div className="adm-confirm-actions">
              <button type="button" className="adm-btn adm-btn-ghost" onClick={props.onCancelDelete}>{block ? "OK" : "Cancel"}</button>
              {!block && <button type="button" className="adm-btn adm-btn-danger-solid" disabled={panel.busy} onClick={props.onDelete}>
                {panel.busy ? "Deleting…" : "Delete record"}</button>}
            </div>
          </div>}
        </>}
        {isForm && config.editor && <form className="adm-form" noValidate onSubmit={event => { event.preventDefault(); props.onSave(); }}>
          <p className="adm-form-note">Fields marked <span className="adm-req">*</span> are required.</p>
          {config.editor.fields.map(field => <FormField key={field.key} field={field} value={panel.form[field.key] ?? ""}
            error={panel.errors[field.key] ?? ""} options={config.customerOptions?.() ?? []}
            onChange={value => props.onField(field.key, value)} onError={message => props.onFieldError(field.key, message)} />)}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>}
      </div>

      <div className="adm-panel-foot">
        {!isForm ? <>
          <button type="button" className="adm-btn adm-btn-danger" disabled={panel.confirming} onClick={props.onAskDelete}>Delete</button>
          <span className="adm-spacer" />
          <button type="button" className="adm-btn adm-btn-ghost" onClick={onClose}>Close</button>
          {editable && <button type="button" className="adm-btn adm-btn-primary" onClick={props.onEdit}>Edit details</button>}
        </> : <>
          <button type="button" className="adm-btn adm-btn-ghost" disabled={panel.busy} onClick={props.onCancelEdit}>Cancel</button>
          <button type="button" className="adm-btn adm-btn-primary" disabled={panel.busy} onClick={props.onSave}>
            {panel.busy ? "Saving…" : panel.mode === "new" ? `Create ${config.singular}` : "Save changes"}</button>
        </>}
      </div>
    </aside>
  </>;
}

interface FieldProps {
  field: FieldDef;
  value: string;
  error: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onError: (message: string) => void;
}

function FormField({ field, value, error, options, onChange, onError }: FieldProps) {
  const id = `adm-field-${field.key}`;
  const hintId = field.hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": Boolean(error), "aria-describedby": describedBy };
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value);

  return <div className={`adm-field${error ? " adm-field-error" : ""}`}>
    <label htmlFor={id}>{field.label}{field.required && <span className="adm-req" aria-hidden="true"> *</span>}</label>
    {field.type === "image" ? <ImageInput {...common} value={value} onChange={onChange} onError={onError} />
      : field.type === "textarea" ? <textarea {...common} value={value} required={field.required} onChange={change} />
      : field.type === "status" ? <select {...common} value={value} onChange={change}>
        <option value="1">Pending</option><option value="2">Completed</option><option value="3">Cancelled</option>
      </select>
      : <input {...common} type={field.type === "customer" ? "text" : field.type} value={value} required={field.required}
        min={field.min} step={field.step} list={field.type === "customer" ? `${id}-options` : undefined} onChange={change} />}
    {field.type === "customer" && <datalist id={`${id}-options`}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </datalist>}
    {field.hint && <span className="adm-hint" id={hintId}>{field.hint}</span>}
    {error && <span className="adm-error" id={errorId}>{error}</span>}
  </div>;
}

interface ImageInputProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}

/** Picks an image, checks it, uploads it right away and keeps the returned path. */
function ImageInput({ value, onChange, onError, ...input }: ImageInputProps) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = imageFileError(file);
    if (problem) { onError(problem); return; }
    setUploading(true);
    try {
      onChange(await uploadImage(file));
      setFileName(file.name);
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setUploading(false);
    }
  }

  return <div className="adm-img-field">
    {value ? <img className="adm-img-preview" src={value} alt="Preview of the selected image" />
      : <div className="adm-img-preview adm-thumb-empty" aria-hidden="true"><ImageIcon size={28} /></div>}
    <div className="adm-img-actions">
      <label className="adm-btn adm-btn-ghost adm-btn-sm adm-file-btn">
        <UploadIcon />{uploading ? "Uploading…" : value ? "Replace image" : "Choose image"}
        <input {...input} className="adm-sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => void pick(event)} />
      </label>
      {value && <>
        {fileName && <span className="adm-hint">{fileName}</span>}
        <button type="button" className="adm-text-btn" onClick={() => { onChange(""); setFileName(""); }}>Remove image</button>
      </>}
    </div>
  </div>;
}
