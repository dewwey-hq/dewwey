import type { VenueVendor } from "./VenuesClient";

export type MapVenueCard = VenueVendor & {
  displayRating: number;
  displayReviews: number;
  location: string;
  displayAddress: string;
  styleLabel: string;
};
