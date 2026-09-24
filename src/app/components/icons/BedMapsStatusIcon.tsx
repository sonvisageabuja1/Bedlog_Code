import { BED_MAPS_ICON_SRC, BED_MAPS_STATUS } from "../../constants";
import type { BedStatus } from "../../types";
import { BedMapsBedIcon } from "./BedMapsBedIcon";

export function BedMapsStatusIcon({
  status,
  color,
}: {
  status: BedStatus;
  color: string;
}) {
  const src = BED_MAPS_ICON_SRC[status];
  if (src) {
    return (
      <img
        src={src}
        alt={BED_MAPS_STATUS[status].label}
        draggable={false}
        style={{ width: "82px", height: "auto", display: "block" }}
      />
    );
  }
  return <BedMapsBedIcon color={color} />;
}
