/** Data atual no fuso de Brasília no formato YYYY-MM-DD. */
export function brasiliaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const LAST_LOGIN_DATE_KEY = "app:last_login_date";

/** Registra a data (Brasília) do login atual. */
export function recordLoginDate() {
  try {
    localStorage.setItem(LAST_LOGIN_DATE_KEY, brasiliaToday());
  } catch {
    /* storage indisponível */
  }
}
