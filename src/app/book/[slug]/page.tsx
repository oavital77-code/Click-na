import { BookingPage, bookingMetadata } from "./booking-page";

export async function generateMetadata({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  return bookingMetadata(slug, null);
}

export default async function Page({ params }: PageProps<"/book/[slug]">) {
  const { slug } = await params;
  return <BookingPage slug={slug} placeSlug={null} />;
}
