// A form-level error. It is an alert region, so assistive technology announces it, and the message is
// always rendered as text.
export function ErrorSummary({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="form-error">
      {message}
    </p>
  );
}
