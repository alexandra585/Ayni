export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="9" y="0" width="8" height="8" rx="2" />
      <rect x="0" y="9" width="8" height="8" rx="2" />
      <rect className="m" x="9" y="9" width="8" height="8" rx="2" />
      <rect x="18" y="9" width="8" height="8" rx="2" />
      <rect x="9" y="18" width="8" height="8" rx="2" />
    </svg>
  );
}
