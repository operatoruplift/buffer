export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 4H18C23.25 4 26.5 6.35 26.5 10.25C26.5 13.45 24.15 15.5 20 15.5H8.5L5 12V4ZM11 8.5V11H17.75C19.35 11 20.15 10.55 20.15 9.75S19.35 8.5 17.75 8.5H11ZM5 17H20C24.9 17 27.5 19.1 27.5 22.7C27.5 26.75 24.1 29 18.25 29H5V17ZM11 21.5V24.5H18.1C19.95 24.5 20.9 24 20.9 23S19.95 21.5 18.1 21.5H11Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
export function Icon({
  name,
  size = 18,
}: {
  name:
    | "arrow"
    | "refresh"
    | "copy"
    | "external"
    | "download"
    | "close"
    | "info"
    | "check"
    | "wallet"
    | "sliders";
  size?: number;
}) {
  const paths = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    refresh: (
      <>
        <path d="M20 8a8 8 0 1 0 .2 8M20 3v5h-5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M15 8V4H4v11h4" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v.2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 8h18m-5 5h5m-5 3h.1" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" fill="currentColor" />
        <circle cx="15" cy="17" r="3" fill="currentColor" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
