// The 3-2-1 before the call starts (src/App.tsx prepareAndStart): the meeting behind is
// blurred, and each number flies in from far away, grows past the viewer and fades, as in
// an awards-show countdown. In the site's colors and wordmark face (2026-10-24: a loud
// version with shockwaves was too much, a plain Apple-like one did not fit the site's tech
// look; then the user dropped the ring around the number, so only the number shows).

export function Countdown({ value }: { value: number }) {
  return (
    <div className="countdown" role="status" aria-live="assertive" aria-label={`Starting in ${value}`}>
      <div className="countdown-dial" aria-hidden="true">
        {/* A new key restarts the flight on every second. */}
        <span key={value} className="countdown-number">
          {value}
        </span>
      </div>
      <p className="countdown-label">Your interview is starting</p>
    </div>
  );
}
