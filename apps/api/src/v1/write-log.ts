export type RecordType = 'project' | 'threat_model' | 'element' | 'threat' | 'mitigation';
export type WriteAction = 'create' | 'update' | 'delete';

// One stdout line per successful write: who did what to which record (FR-014a). It takes ids only,
// so a name, a description, the token or the request body can never end up in the log.
export function logWrite(accountId: number, action: WriteAction, type: RecordType, id: string): void {
  console.log(JSON.stringify({ event: 'write', account_id: accountId, action, type, id }));
}
