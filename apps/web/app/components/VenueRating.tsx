import { Star } from "lucide-react";
import { formatCount } from "@/lib/format-address";

export default function VenueRating({
  rating,
  reviews,
  showReviewLabel = false,
}: {
  rating: number;
  reviews: number;
  showReviewLabel?: boolean;
}) {
  if (rating <= 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-1 gap-y-0.5 text-sm font-medium text-gray-800">
      <Star size={14} className="fill-rose-400 text-rose-400" />
      <span>{rating.toFixed(1)}</span>
      {reviews > 0 ? (
        <span className="text-xs font-normal text-gray-400">
          ({formatCount(reviews)}
          {showReviewLabel ? " reviews" : ""})
        </span>
      ) : null}
    </div>
  );
}
