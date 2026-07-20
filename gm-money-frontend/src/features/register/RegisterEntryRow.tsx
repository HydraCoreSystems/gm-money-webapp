import type { RegisterEntry } from "../../api/types";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function statusClass(status: string): string {
  switch (status) {
    case "Uncleared":
      return "gm-status-badge gm-status-badge--uncleared";
    case "Cleared":
      return "gm-status-badge gm-status-badge--cleared";
    case "Reconciled":
      return "gm-status-badge gm-status-badge--reconciled";
    default:
      return "gm-status-badge";
  }
}

type Props = {
  entry: RegisterEntry;
};

export function RegisterEntryRow({ entry }: Props) {
  return (
    <div className="gm-register-row">
      <div className="gm-register-row__main">
        <div className="gm-register-row__payee">{entry.payee}</div>
        <div className="gm-register-row__meta">
          {entry.date} · {entry.category}
          {entry.subcategory ? ` → ${entry.subcategory}` : ""}
        </div>
      </div>
      <div className="gm-register-row__amounts">
        <div className={entry.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
          {formatMoney(entry.amount)}
        </div>
        <div className="gm-register-row__balance">{formatMoney(entry.runningBalance)}</div>
      </div>
      <span className={statusClass(entry.status)}>{entry.status}</span>
    </div>
  );
}
