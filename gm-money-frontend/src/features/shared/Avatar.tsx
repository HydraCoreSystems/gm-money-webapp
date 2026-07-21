// A small colored initial-bubble used on every list row (Register,
// Review, Scheduled, Merchants, Dashboard recent transactions) for the
// "layered/dimensional" look — same gradient + shadow language as the
// rest of the redesign, just applied at icon scale. Color is a stable
// hash of the label, so the same payee/merchant always gets the same
// color rather than shifting per list position.
const AVATAR_GRADIENTS: [string, string][] = [
  ["#1c7a4a", "#52b788"],
  ["#7a4a1c", "#c99a4a"],
  ["#7a2456", "#c34b8e"],
  ["#3d3480", "#7c5cd9"],
  ["#123d25", "#2e8b57"],
  ["#0f6e56", "#1d9e75"],
  ["#185fa5", "#378add"],
  ["#a8391f", "#e0703f"],
  ["#5f6f65", "#8a978d"],
  ["#8a6300", "#d9a441"],
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
