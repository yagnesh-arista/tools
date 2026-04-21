# Google Apps Script (GAS) Patterns — applies to all GAS projects

## Loading Overlay Safety Guard (Rule 20)

**Problem:** GAS framework-level failures (auth token expiry, quota exhaustion, network drop)
fire *neither* `withSuccessHandler` nor `withFailureHandler`. The overlay stays up forever.
Script-level errors DO reach `withFailureHandler` — framework failures are invisible.

**Rule: Every `showGlobalLoading()` call must be paired with a `_guard` timeout.**

```javascript
showGlobalLoading("Doing something...");

const _guard = setTimeout(() => {
  hideGlobalLoading();
  setStatus("Operation timed out — try again", "status-error");
}, 15000); // see timeout table below

google.script.run
  .withSuccessHandler(result => {
    clearTimeout(_guard);   // ← ALWAYS FIRST, before any DOM ops
    hideGlobalLoading();    // ← ALWAYS SECOND for modal-open handlers
    // ... rest of handler
  })
  .withFailureHandler(err => {
    clearTimeout(_guard);   // ← ALWAYS FIRST
    hideGlobalLoading();
    alert("Error: " + err.message);
  })
  .yourGasFunction();
```

### Timeout values by operation type

| Operation type | Timeout | Notes |
|---|---|---|
| Modal open / read ops | 15s | `openTechModal`, `openIpConfigModal`, etc. |
| Save settings ops | 15s | `saveTechSettings`, `saveIpConfig`, etc. |
| Config fetch (`fetchFullConfig`) | 20s | Flushes `fetchQueue` callbacks on timeout |
| Force sync / schema ops | 60s | Also clears `syncPollTimer` with `clearInterval` |

### `hideGlobalLoading` position in success handler

- **Modal-open handlers**: `hideGlobalLoading()` must be the FIRST call, before any DOM
  field assignments. A DOM error partway through an assignment chain would leave the overlay
  permanently shown if `hideGlobalLoading` is last.
- **Save handlers**: `hideGlobalLoading()` at the top, before state updates.

### Callback queue pattern (`fetchFullConfig` style)

When a GAS call stores a callback in a queue object and flushes it on completion, the
`_guard` must flush the queue on timeout too — otherwise the stored callback (often
`hideGlobalLoading`) is never called:

```javascript
const _guard = setTimeout(() => {
  pendingFetches.delete(deviceName);
  if (fetchQueue[deviceName]) {
    fetchQueue[deviceName].forEach(cb => cb('timeout'));
    delete fetchQueue[deviceName];
  }
  setStatus("Config fetch timed out for " + deviceName, "status-error");
}, 20000);

google.script.run
  .withSuccessHandler(res => {
    clearTimeout(_guard);
    // ... flush fetchQueue normally
  })
  .withFailureHandler(err => {
    clearTimeout(_guard);
    // ... flush fetchQueue with error
  })
  .getDeviceConfig(deviceName);
```

### Checklist when adding any new GAS call with `showGlobalLoading`

- [ ] `_guard = setTimeout(hideGlobalLoading + setStatus, N)` declared before `.run`
- [ ] `clearTimeout(_guard)` is the first statement in `withSuccessHandler`
- [ ] `clearTimeout(_guard)` is the first statement in `withFailureHandler`
- [ ] `hideGlobalLoading()` is called in both handlers
- [ ] If using a callback queue: `_guard` flushes the queue on timeout
- [ ] Timeout value matches the operation type (15 / 20 / 60s)
- [ ] Status message on timeout is user-actionable ("try again")
