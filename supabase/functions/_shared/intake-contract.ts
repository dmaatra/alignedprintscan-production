export type IntakeParticipant = Record<string, unknown>;

/**
 * PostgREST bulk inserts require every object in a JSON array to expose the
 * same set of keys. Keep signer and witness rows contract-identical while
 * preserving nullable service-specific values.
 */
export function normalizedIntakeParticipants(
  participants: IntakeParticipant[],
  requestId: string,
) {
  return participants.map((person, index) => ({
    service_request_id: requestId,
    participant_type: person.participant_type ?? null,
    first_name: person.first_name ?? null,
    middle_name: person.middle_name ?? null,
    last_name: person.last_name ?? null,
    full_legal_name: person.full_legal_name ?? null,
    email: person.email ?? null,
    address: person.address ?? null,
    identity_name_confirmed: person.identity_name_confirmed === true,
    witness_source: person.witness_source ?? null,
    quantity: Number(person.quantity ?? 1),
    sort_order: Number(person.sort_order ?? index),
    mobile_phone: person.phone ?? person.mobile_phone ?? null,
  }));
}
