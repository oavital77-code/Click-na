import { createEvent, type DateArray } from "ics";

function toDateArray(date: Date): DateArray {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1, // ics uses 1-indexed months, unlike JS Date
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

export function generateBookingIcs(input: {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  therapistFullName: string;
  location: string | null;
}) {
  const { error, value } = createEvent({
    uid: input.uid,
    start: toDateArray(input.startsAt),
    end: toDateArray(input.endsAt),
    startInputType: "utc",
    endInputType: "utc",
    title: `תור אצל ${input.therapistFullName}`,
    location: input.location ?? undefined,
    status: "CONFIRMED",
    productId: "Cleana+",
  });

  if (error || !value) {
    throw error ?? new Error("Failed to generate ICS file");
  }
  return value;
}
