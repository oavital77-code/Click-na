import { BookingPage, bookingMetadata } from "../booking-page";

/**
 * The link a therapist hands the clients of one clinic: the same page, with
 * the place already chosen. /book/liron/ramat-gan shows Ramat Gan's hours only.
 */
export async function generateMetadata({ params }: PageProps<"/book/[slug]/[place]">) {
  const { slug, place } = await params;
  return bookingMetadata(slug, place);
}

export default async function Page({ params }: PageProps<"/book/[slug]/[place]">) {
  const { slug, place } = await params;
  return <BookingPage slug={slug} placeSlug={place} />;
}
