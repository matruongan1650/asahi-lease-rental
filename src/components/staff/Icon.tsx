import React from "react";

const ICON_PATHS: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9z" />
    </>
  ),
  clipboardCheck: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9z" />
      <path d="m9.5 14 1.8 1.8 3.2-3.6" />
    </>
  ),
  truck: (
    <>
      <path d="M2 6h11v9H2z" />
      <path d="M13 9h4l3 3v3h-7z" />
      <circle cx="6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  package: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  pen: (
    <>
      <path d="M15 4 20 9 8.5 20.5 3 22l1.5-5.5z" />
      <path d="m13 6 5 5" />
    </>
  ),
  signature: (
    <>
      <path d="M3 17c2.5 0 3-9 5-9s1.5 7 3 7 2-4 4-4 2 3 3 3" />
      <path d="M3 21h18" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  navigation: (
    <>
      <path d="M12 3 4 21l8-4 8 4z" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="5" r="2.4" />
      <path d="M8.4 19H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.6" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2h-2z" />
    </>
  ),
  check: (
    <>
      <path d="m4 12 5 5 11-11" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  x: (
    <>
      <path d="M5 5l14 14M19 5 5 19" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  chevronRight: (
    <>
      <path d="m9 5 7 7-7 7" />
    </>
  ),
  chevronLeft: (
    <>
      <path d="m15 5-7 7 7 7" />
    </>
  ),
  chevronDown: (
    <>
      <path d="m6 9 6 6 6-6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M20 12H4" />
      <path d="m10 6-6 6 6 6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2 8-2 8h16s-2-2-2-8z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  phone: (
    <>
      <path d="M5 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L19 16l2 5v-3a16 16 0 0 1-16-16z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  car: (
    <>
      <path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" />
      <path d="M4 11h16v6H4z" />
      <circle cx="7.5" cy="17.5" r="1.4" />
      <circle cx="16.5" cy="17.5" r="1.4" />
    </>
  ),
  wrench: (
    <>
      <path d="M15 5a4 4 0 0 0-5.2 5.2L4 16v4h4l5.8-5.8A4 4 0 0 0 19 9l-2.5 2.5-2-2L17 7z" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 21V8l9-4 9 4v13" />
      <path d="M7 21v-7h10v7" />
      <path d="M7 17h10" />
    </>
  ),
  boxIn: (
    <>
      <path d="M12 3v9" />
      <path d="m8 8 4 4 4-4" />
      <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    </>
  ),
  boxOut: (
    <>
      <path d="M12 12V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  filter: (
    <>
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 18.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.6a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.7 6L5.6 5.9a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.1V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 .9 2.7H20a2 2 0 1 1 0 4z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="m3 17 5-4 4 3 3-2 6 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  minus: (
    <>
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 4 2 4H5" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 4v4h-4" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 20v-4h4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 16l-4-4 4-4" />
      <path d="M5 12h11" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.2 3 7.7 7 9 4-1.3 7-4.8 7-9V6z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  weight: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M8 11h8l1.5 9h-11z" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4" />
    </>
  ),
  moon: (
    <>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
    </>
  ),
  cone: (
    <>
      <path d="M12 3 6 21h12z" />
      <path d="M8.7 11h6.6M7.5 16h9" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="8" width="15" height="9" rx="2" />
      <path d="M21 11v3" />
      <rect x="5" y="10" width="9" height="5" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  star: (
    <>
      <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 3 11l7 2 2 7z" />
      <path d="M21 3 11 13" />
    </>
  ),
  file: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  fileCheck: (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
      <path d="m9 15 1.6 1.6L14 13" />
    </>
  ),
  fuel: (
    <>
      <rect x="4" y="3" width="9" height="18" rx="1.5" />
      <path d="M4 11h9" />
      <path d="M13 7h3l2 2v7a2 2 0 0 1-4 0v-4h-1" />
    </>
  ),
  yen: (
    <>
      <path d="M12 4 7 11h10L12 4z" />
      <path d="M12 11v9M8 14h8M8 17h8" />
    </>
  ),
  gauge: (
    <>
      <path d="M12 14 16 9" />
      <circle cx="12" cy="14" r="1.6" />
      <path d="M4 18a8 8 0 1 1 16 0" />
    </>
  ),
  paperclip: (
    <>
      <path d="M20 11 11.5 19.5a4 4 0 0 1-5.7-5.7l8.5-8.5a2.5 2.5 0 0 1 3.5 3.5l-8 8a1 1 0 0 1-1.4-1.4l7-7" />
    </>
  ),
  idCard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c0-1.7 1.3-2.5 3-2.5s3 .8 3 2.5M14 9h4M14 13h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  droplet: (
    <>
      <path d="M12 3s6 6 6 10a6 6 0 1 1-12 0c0-4 6-10 6-10z" />
    </>
  ),
};

export interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function Icon({
  name,
  size = 22,
  stroke = 2,
  color,
  style,
  className,
}: IconProps) {
  const p = ICON_PATHS[name];
  if (!p) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {p}
    </svg>
  );
}
