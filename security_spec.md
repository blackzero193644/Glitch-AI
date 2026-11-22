# Security Specification: Glitch AI v1.0 Cloud Firestore Data & Rules

## 1. Data Invariants

1. **User Ownership & Permanent Account Invariant**: A user document at `/users/{userId}` can only be read (`get`), created, or updated by the authenticated, email-verified user whose `request.auth.uid == userId`. Account deletion (`allow delete`) is strictly disabled (`false`) so user accounts and credit balances remain permanent.
2. **Bounded Credit Balance Invariant**:
   - Every new `/users/{userId}` account MUST be created with `credits == 100` (integer).
   - Legacy profiles missing `credits` may be migrated once to `credits == 100`.
   - Regular profile edits cannot alter `credits`.
   - Credit deductions (image generation or outgoing atomic credit transfer) may decrease `credits` (`0 <= incoming().credits < existing().credits`).
   - Lucky ad reward claims may ONLY increment `credits` by an integer between `1` and `10` (`existing().credits < incoming().credits <= existing().credits + 10`) up to a hard ceiling of `10000`.
   - Incoming credit transfer claims may ONLY increment `credits` by the exact `amount` of a `'pending'` `/creditTransfers/{transferId}` addressed to `userId` (`toUserId == userId`), while atomically transitioning that transfer to `'claimed'` via `getAfter`.
3. **Privacy-Preserving Recipient Lookup (`/creditDirectory/{lookupId}`)**:
   - Stores ONLY `{ lookupId, userId, displayName, updatedAt }` — zero plaintext emails or PII.
   - `allow list` is strictly `false` so directory scraping/enumeration is impossible; only signed-in users who already know a recipient's Account ID (`uid_<uid>`) or exact SHA-256 hashed email (`email_<sha256>`) may `get` a single lookup record.
   - Owners may only write entries pointing to their own `request.auth.uid`.
4. **Atomic Credit Transfers (`/creditTransfers/{transferId}`)**:
   - Readable (`get`, `list`) ONLY by `fromUserId == request.auth.uid` or `toUserId == request.auth.uid`.
   - `create` requires `fromUserId == request.auth.uid`, `toUserId != request.auth.uid`, `1 <= amount <= 1000`, `status == 'pending'`, existing recipient `/users/{toUserId}`, and atomic `getAfter(/users/$(fromUserId)).data.credits == existingSenderCredits - amount`.
   - `update` requires `toUserId == request.auth.uid`, `existing().status == 'pending'`, transitioning strictly to `status == 'claimed'` (`claimedAt == request.time`), and atomic `getAfter(/users/$(toUserId)).data.credits == existingRecipientCredits + existing().amount`.
   - `delete` is strictly `false` (immutable audit ledger).
5. **Strict Identity Integrity**: Any write to `/users/{userId}/threads/{threadId}` or `/users/{userId}/threads/{threadId}/messages/{messageId}` must have `request.auth.uid == userId`, verified email token, matching `userId` fields, and an existing parent document (`exists()`).
6. **Volume, Immutability & Connection Validation**:
   - Strict field allowlists (`hasOnly`) and size bounds across all collections.
   - `createdAt` and `updatedAt` validated against `request.time`; `userId` and `threadId` immutable.
   - `/test/connection` allows single-doc `get` only (`list, write: if false`).

---

## 2. Malicious Payloads Blocked by Rules

1. **Spoofed User Creation**: Attempting to write `/users/target_victim_123` with `auth.uid = attacker_456`.
2. **Arbitrary Credit Inflation Attack**: Updating `/users/user_A` from `credits: 45` by `+500` or `+11` in one mutation without a matching pending transfer.
3. **Double-Claim Transfer Replay Attack**: Recipient attempting to claim the same `/creditTransfers/tx_1` twice (`existing().status == 'claimed'` rejects immediately).
4. **Unbacked Transfer Minting Attack**: Sender creating a `/creditTransfers/tx_9` for `amount: 500` without simultaneously deducting `500` from `/users/{senderUid}` (`getAfter` invariant fails).
5. **Self-Transfer Credit Farming**: Sender creating a transfer with `toUserId == request.auth.uid`.
6. **Directory Scraping**: Calling `list` on `/creditDirectory` or `/users` (`allow list: if false`).
7. **Foreign Transfer Snooping**: User C attempting `get` or `list` on `/creditTransfers` between User A and User B.
8. **Foreign Thread Snooping / Injection**: User B attempting read/write on `/users/user_A/threads`.
9. **Gigantic Payload Denial of Wallet**: Injecting >200KB avatar or >850KB image strings.
10. **Shadow Field Injection / Role Escalation**: Adding `{ isAdmin: true }` or `role: "system"`.
11. **Account Delete-and-Reset Exploit**: Calling `delete` on `/users/{userId}` or `/creditTransfers/{id}`.
12. **Timestamp Spoofing**: Sending backdated/future `createdAt`, `updatedAt`, or `claimedAt`.
