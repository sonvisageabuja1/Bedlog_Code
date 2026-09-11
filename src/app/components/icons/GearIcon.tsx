export function GearIcon({ onPress }: { onPress: () => void }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      className="relative shrink-0 size-[38px] bg-[#eaddff] rounded-full flex items-center justify-center active:opacity-80"
    >
      <svg
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="#4F378A"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19.622 10.395l-1.097-2.65L20 6l-2-2-1.735 1.483-2.707-1.113L12.935 2h-1.954l-.582 2.401-2.645 1.115L6 4 4 6l1.453 1.789-1.08 2.657L2 11v2l2.401.655L5.516 16.3 4 18l2 2 1.791-1.46 2.606 1.072L11 22h2l.604-2.387 2.651-1.098L18 20l2-2-1.462-1.808 1.085-2.648L22 13v-2l-2.378-.605Z"
          stroke="#4F378A"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
