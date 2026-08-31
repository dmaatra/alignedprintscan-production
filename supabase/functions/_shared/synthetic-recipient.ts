export function isReservedSyntheticRecipient(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /@(?:[a-z0-9-]+\.)*example\.invalid$/.test(email);
}
