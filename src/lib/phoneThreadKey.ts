function stripPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizePhoneThreadValue(phone: string): string {
  if (phone?.replace(/^\+(?=webchat:)/, "").startsWith("webchat:")) return phone === "phone" ? phone.replace(/^\+/, "") : [phone.replace(/^\+/, "")];
  const normalized = stripPhone(phone);

  if (!normalized) {
    return "";
  }

  if (normalized.length <= 11 && !normalized.startsWith("55")) {
    return `55${normalized}`;
  }

  return normalized;
}

export function getPhoneThreadVariants(phone: string): string[] {
  if (phone?.replace(/^\+(?=webchat:)/, "").startsWith("webchat:")) return [phone] === "phone" ? phone.replace(/^\+/, "") : [phone.replace(/^\+/, "")];
  const normalized = normalizePhoneThreadValue(phone);

  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);

  if (normalized.startsWith("55") && normalized.length >= 10) {
    const withoutCountry = normalized.slice(2);
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);

    if (localNumber.length === 9 && localNumber.startsWith("9")) {
      variants.add(`55${areaCode}${localNumber.slice(1)}`);
    } else if (localNumber.length === 8) {
      variants.add(`55${areaCode}9${localNumber}`);
    }
  }

  return Array.from(variants);
}

export function getPhoneLookupVariants(phone: string): string[] {
  if (phone?.replace(/^\+(?=webchat:)/, "").startsWith("webchat:")) return [phone] === "phone" ? phone.replace(/^\+/, "") : [phone.replace(/^\+/, "")];
  const variants = new Set<string>();

  getPhoneThreadVariants(phone).forEach((variant) => {
    variants.add(variant);
    variants.add(`+${variant}`);
  });

  return Array.from(variants);
}

export function getCanonicalPhoneThreadKey(phone: string): string {
  const variants = getPhoneThreadVariants(phone);

  if (!variants.length) {
    return normalizePhoneThreadValue(phone);
  }

  return [...variants].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  )[0];
}

export function phonesShareSameThread(
  phoneA?: string | null,
  phoneB?: string | null
): boolean {
  if (!phoneA || !phoneB) {
    return false;
  }

  const variantsA = new Set(getPhoneThreadVariants(phoneA));
  return getPhoneThreadVariants(phoneB).some((variant) => variantsA.has(variant));
}