import type { ReactNode } from "react";

// Stroke icons for the admin dashboard; all decorative (aria-hidden), labels live on the controls.
type IconProps = { size?: number };

function Icon({ size = 18, children, strokeWidth = 2 }: IconProps & { children: ReactNode; strokeWidth?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export const DashboardIcon = (p: IconProps) => <Icon size={20} {...p}><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></Icon>;
export const CustomersIcon = (p: IconProps) => <Icon size={20} {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8" /><path d="M22 21a7 7 0 0 0-4-6.3" /></Icon>;
export const EventsIcon = (p: IconProps) => <Icon size={20} {...p}><circle cx="6" cy="17" r="4" /><circle cx="18" cy="17" r="4" /><path d="M6 17l4-8h6l2 8" /><path d="M9 6h3" /></Icon>;
export const AppointmentsIcon = (p: IconProps) => <Icon size={20} {...p}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M9 15l2 2 4-4" /></Icon>;
export const OrdersIcon = (p: IconProps) => <Icon size={20} {...p}><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></Icon>;
export const PaymentsIcon = (p: IconProps) => <Icon size={20} {...p}><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></Icon>;
export const InventoryIcon = (p: IconProps) => <Icon size={20} {...p}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon strokeWidth={2.5} {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const ViewIcon = (p: IconProps) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const EditIcon = (p: IconProps) => <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Icon>;
export const DeleteIcon = (p: IconProps) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></Icon>;
export const CloseIcon = (p: IconProps) => <Icon size={20} {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const CheckIcon = (p: IconProps) => <Icon strokeWidth={2.5} {...p}><path d="M5 12l5 5L20 7" /></Icon>;
export const ImageIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></Icon>;
export const UploadIcon = (p: IconProps) => <Icon {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Icon>;
