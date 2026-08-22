/** Extract display dimensions from apify/instagram-scraper items. */
function mediaDimensionsFromApify(item) {
  const read = (obj) => {
    if (!obj) return null;
    const w = obj.dimensionsWidth ?? obj.dimensions?.width;
    const h = obj.dimensionsHeight ?? obj.dimensions?.height;
    if (w > 0 && h > 0) return { width: w, height: h };
    return null;
  };

  const direct = read(item);
  if (direct) return direct;

  const firstChild = item.childPosts?.[0];
  const fromChild = read(firstChild);
  if (fromChild) return fromChild;

  return { width: null, height: null };
}

module.exports = { mediaDimensionsFromApify };
