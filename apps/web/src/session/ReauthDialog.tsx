import { useEffect, useRef } from 'react';
import { useSession } from './SessionProvider.js';
import { SignInForm } from './SignInForm.js';

// Shown over the page when the session ended while changes were unsaved (spec FR-020d). The page behind stays
// as it was, with the changes on it; only the account that made them can sign in to save them. It is a modal
// dialog, so the page behind is inert, and Escape does not close it: the user chooses to sign in or to give
// the changes up.
export function ReauthDialog() {
  const { account, unsaved, reauth, discardAndSignOut } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="reauth-title" onCancel={(event) => event.preventDefault()}>
      <h2 id="reauth-title">Your session ended</h2>
      <p>
        Sign in again to save your {unsaved} {unsaved === 1 ? 'change' : 'changes'}.
      </p>
      <SignInForm fixedUsername={account?.username ?? ''} submitLabel="Sign in and save" onSubmit={(_username, password) => reauth(password)}>
        <button type="button" onClick={discardAndSignOut}>
          Discard changes and sign out
        </button>
      </SignInForm>
    </dialog>
  );
}
