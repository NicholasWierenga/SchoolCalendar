const symbols = { football: '🏈', trophy: '🏆' }

function symbolImage(symbol) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><text x="24" y="35" text-anchor="middle" font-size="36">' +
    symbol +
    '</text></svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export default function EventImage({ image, ...props }) {
  if (!image) return null
  const src = Object.hasOwn(symbols, image) ? symbolImage(symbols[image]) : image
  if (!Object.hasOwn(symbols, image) && !/^data:image\/(png|jpeg|webp);base64,/i.test(src)) return null
  return <img className="event-image" alt="" data-testid="event-image" {...props} src={src} />
}
