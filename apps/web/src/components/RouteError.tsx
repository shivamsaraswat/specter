import { Link, useRouteError } from 'react-router';

// What a page shows when it breaks and nothing closer to the problem caught it. It stands in for the router's
// own "Unexpected Application Error!" screen. The error itself is logged for whoever is debugging and is not
// shown: it is no use to the user, and it can be an internal detail. The page's state is gone by the time this
// is shown, so it cannot say how much was unsaved, only that something may have been.
export function RouteError() {
  const error = useRouteError();
  console.error('A page stopped working', error);
  return (
    <div role="alert" className="route-error">
      <h1>Something went wrong</h1>
      <p>This page stopped working. Anything you changed that had not yet been saved may be lost: look for it after reloading.</p>
      <p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>{' '}
        <Link to="/projects">Back to projects</Link>
      </p>
    </div>
  );
}
