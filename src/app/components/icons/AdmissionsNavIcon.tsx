export function AdmissionsNavIcon({
  color = "#64748B",
}: {
  color?: string;
}) {
  // Admissions icon — a clipboard list, drawn to match the other nav icons
  // (viewBox 0 0 16 16, strokeWidth 1.33276).
  return (
    <svg
      className="shrink-0"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M5.33203 2.66553H3.99877C3.6453 2.66553 3.30631 2.80594 3.05637 3.05588C2.80643 3.30582 2.66602 3.64482 2.66602 3.99829V13.3274C2.66602 13.6809 2.80643 14.0199 3.05637 14.2698C3.30631 14.5198 3.6453 14.6602 3.99877 14.6602H11.9953C12.3488 14.6602 12.6878 14.5198 12.9377 14.2698C13.1877 14.0199 13.3281 13.6809 13.3281 13.3274V3.99829C13.3281 3.64482 13.1877 3.30582 12.9377 3.05588C12.6878 2.80594 12.3488 2.66553 11.9953 2.66553H10.6621"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.33203 1.33276H10.6621V3.99829H5.33203V1.33276Z"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.33203 7.33057H10.6621M5.33203 9.99609H10.6621M5.33203 12.6616H8.66211"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
