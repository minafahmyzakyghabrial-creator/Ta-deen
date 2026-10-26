# Flows (business workflows)

A **flow** is a business journey composed of several page objects, e.g.
`submitNewLicenseApplication()` or `approveRequest(requestId)`.

Rules:

- Flows orchestrate page objects; they never contain raw selectors.
- Flows that create or change data call `assertMutationsAllowed('<action>')` first
  (blocks them in PROD).
- Flows return business values (e.g. the generated Request ID) so a test can pass them to
  another portal/user.
- One file per business area: `license-issuance.flow.ts`, `license-transfer.flow.ts`, ...

See `request.flow.ts` for the contract used by the cross-portal template test.
