// A small colored initial-bubble used on every list row (Register,
// Review, Scheduled, Merchants, Dashboard recent transactions). Color is
// a stable hash of the label, so the same payee/merchant always gets the
// same color rather than shifting per list position. Palette is drawn
// only from the app's own forest/moss/amber family (not an arbitrary
// rainbow) to stay consistent with the rest of the redesign.
const AVATAR_GRADIENTS: [string, string][] = [
  ["#17372a", "#2f5d45"],
  ["#2f5d45", "#557d55"],
  ["#1c4b3a", "#3d7f63"],
  ["#8a5b1d", "#b97725"],
  ["#3a4d43", "#5c6f64"],
  ["#6b4423", "#a06830"],
];

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function avatarGradient(label: string): string {
  const [from, to] = AVATAR_GRADIENTS[hashString(label || "?") % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

type Props = {
  label: string;
  size?: number;
};

export function Avatar({ label, size = 34 }: Props) {
  const initial = (label || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: avatarGradient(label),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 700,
        color: "#f6f9f4",
        flexShrink: 0,
        boxShadow: "0 4px 10px -4px rgba(15, 61, 38, 0.5)",
      }}
    >
      {initial}
    </div>
  );
}
