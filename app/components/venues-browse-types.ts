import type { VenueVendor } from "./VenuesClient";

export type MapVenueCard = VenueVendor & {
  displayRating: number;
  displayReviews: number;
  location: string;
  displayAddress: string;
  photoUrl: string;
  photoUrls: string[];
  styleLabel: string;
};
