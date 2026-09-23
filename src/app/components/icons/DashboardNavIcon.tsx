export function DashboardNavIcon({
  color = "white",
}: {
  color?: string;
}) {
  // Dashboard icon — supplied artwork, viewBox 0 0 16 16, strokeWidth 1.33276
  return (
    <svg
      className="shrink-0"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M5.99827 1.99902H2.66638C2.29835 1.99902 2 2.29737 2 2.6654V7.33006C2 7.69809 2.29835 7.99644 2.66638 7.99644H5.99827C6.36631 7.99644 6.66465 7.69809 6.66465 7.33006V2.6654C6.66465 2.29737 6.36631 1.99902 5.99827 1.99902Z"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.3284 1.99902H9.99646C9.62843 1.99902 9.33008 2.29737 9.33008 2.6654V4.66454C9.33008 5.03257 9.62843 5.33092 9.99646 5.33092H13.3284C13.6964 5.33092 13.9947 5.03257 13.9947 4.66454V2.6654C13.9947 2.29737 13.6964 1.99902 13.3284 1.99902Z"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.3284 7.99658H9.99646C9.62843 7.99658 9.33008 8.29493 9.33008 8.66296V13.3276C9.33008 13.6956 9.62843 13.994 9.99646 13.994H13.3284C13.6964 13.994 13.9947 13.6956 13.9947 13.3276V8.66296C13.9947 8.29493 13.6964 7.99658 13.3284 7.99658Z"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.99827 10.6621H2.66638C2.29835 10.6621 2 10.9605 2 11.3285V13.3276C2 13.6957 2.29835 13.994 2.66638 13.994H5.99827C6.36631 13.994 6.66465 13.6957 6.66465 13.3276V11.3285C6.66465 10.9605 6.36631 10.6621 5.99827 10.6621Z"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
