import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div>
      <h1>This page doesn&apos;t exist.</h1>
      <p>
        <Link to="/projects">Back to the project list</Link>
      </p>
    </div>
  );
}
