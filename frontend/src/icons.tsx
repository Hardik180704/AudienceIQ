import type { ReactNode } from 'react';

export type IconName =
  | 'plus'
  | 'trash'
  | 'users'
  | 'user-x'
  | 'zap'
  | 'alert'
  | 'refresh'
  | 'check'
  | 'chart'
  | 'clock';

const PATHS: Record<IconName, string[]> = {
  plus: ['M12 5v14M5 12h14'],
  trash: [
    'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1.4 14a2 2 0 0 1-2 2H8.4a2 2 0 0 1-2-2L5 6',
    'M10 11v6M14 11v6',
  ],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  'user-x': ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M22 11l-4 4M18 11l4 4'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z', 'M12 9v4M12 17h.01'],
  refresh: ['M23 4v6h-6', 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10'],
  check: ['M20 6 9 17l-5-5'],
  chart: ['M4 20V10M10 20V4M16 20v-6'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 3'],
};

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
