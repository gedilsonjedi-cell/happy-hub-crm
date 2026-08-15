/** Conta break-glass: sempre isenta do OTP e única autorizada a mexer no kill-switch. */
export const OTP_ADMIN_EMAIL = "allan.pedro147@gmail.com";

export function isOtpAdminEmail(email?: string | null): boolean {
  return String(email || "").trim().toLowerCase() === OTP_ADMIN_EMAIL;
}
