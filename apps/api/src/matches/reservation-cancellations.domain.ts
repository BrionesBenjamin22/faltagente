import type { Tx } from '../waitlist/waitlist.domain.js';
export async function recordCancellation(
  tx: Tx,
  reservation: { id: string; places: number },
  remainingPlaces: number,
  occurredAt: Date,
  source: 'USER' | 'ORGANIZER' | 'MATCH',
  reason: string | null,
) {
  await tx.reservationCancellation.create({
    data: {
      reservationId: reservation.id,
      previousPlaces: reservation.places,
      remainingPlaces,
      occurredAt,
      source,
      reason,
    },
  });
}
