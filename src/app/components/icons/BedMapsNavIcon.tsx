export function BedMapsNavIcon({
  color = "#64748B",
}: {
  color?: string;
}) {
  // Bed Maps icon — supplied artwork, viewBox 0 0 16 16, strokeWidth 1.33276
  return (
    <svg
      className="shrink-0"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M1.33203 13.3274V7.99633C1.33203 7.64286 1.47245 7.30387 1.72239 7.05393C1.97233 6.80399 2.31132 6.66357 2.66479 6.66357H13.3269C13.6803 6.66357 14.0193 6.80399 14.2693 7.05393C14.5192 7.30387 14.6596 7.64286 14.6596 7.99633V13.3274"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.66602 6.6638V3.99829C2.66602 3.64482 2.80643 3.30582 3.05637 3.05588C3.30631 2.80594 3.6453 2.66553 3.99877 2.66553H11.9953C12.3488 2.66553 12.6878 2.80594 12.9377 3.05588C13.1877 3.30582 13.3281 3.64482 13.3281 3.99829V6.6638"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.99609 2.66553V6.6638"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.33203 11.9946H14.6596"
        stroke={color}
        strokeWidth="1.33276"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
