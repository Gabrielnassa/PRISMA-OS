/** Ícones de traço simples (desenhados para o PRISMA OS). */
import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const Icon = {
  dashboard: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>),
  clients: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 21V7l9-4 9 4v14" /><path d="M9 21v-6h6v6" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></svg>),
  create: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 20l1.2-4.2L15.6 5.4a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8.2 18.8z" /><path d="M13.5 7.5l3 3" /><path d="M13 20h7" /></svg>),
  contents: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>),
  approvals: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>),
  media: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 9" /></svg>),
  templates: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="3" width="8" height="10" rx="1.5" /><rect x="13" y="3" width="8" height="6" rx="1.5" /><rect x="13" y="11" width="8" height="10" rx="1.5" /><rect x="3" y="15" width="8" height="6" rx="1.5" /></svg>),
  skills: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" /><path d="M3.5 12L12 16.5 20.5 12" /><path d="M3.5 16L12 20.5 20.5 16" /></svg>),
  integrations: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 01-10 0z" /><path d="M12 17v4" /></svg>),
  costs: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 2v20M17 6.5C17 4.6 14.8 4 12 4s-5 1-5 3 2 2.8 5 3.5 5 1.5 5 3.5-2.2 3-5 3-5-.6-5-2.5" /></svg>),
  users: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6" /></svg>),
  settings: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>),
  strategy: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>),
  calendar: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
  sites: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>),
  ads: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 11l15-6v14L3 13z" /><path d="M7 13v5" /></svg>),
  automations: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>),
  reports: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>),
  menu: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>),
  close: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  logout: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 16l-4-4 4-4M6 12h11" /></svg>),
  chevron: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>),
  plus: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>),
  upload: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>),
  download: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>),
};
