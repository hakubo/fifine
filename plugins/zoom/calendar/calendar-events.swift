// Prints today's timed calendar events (from every calendar in macOS Calendar) as JSON:
//   { "status": "ok", "events": [{ "title", "start", "end", "url", "location", "notes" }] }
//   { "status": "denied" }
// start/end are epoch ms. Events you've declined are left out.
//
// Built by scripts/install.mjs into "fifine Calendar.app" and started with `open`, so macOS treats
// it as its own app and asks for calendar access in its name. Run from inside Control Deck, the
// request would be refused without a prompt, as Control Deck lacks the macOS 14 full-access key.

import EventKit
import Foundation

func emit(_ object: [String: Any]) -> Never {
  FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: object))
  exit(0)
}

let store = EKEventStore()
let done = DispatchSemaphore(value: 0)
var granted = false
store.requestFullAccessToEvents { ok, _ in
  granted = ok
  done.signal()
}
// the first run waits for the user to answer the permission prompt
_ = done.wait(timeout: .now() + 50)
if !granted { emit(["status": "denied"]) }

let now = Date()
let predicate = store.predicateForEvents(
  withStart: now.addingTimeInterval(-12 * 3600), end: now.addingTimeInterval(2 * 3600), calendars: nil)
let events: [[String: Any]] = store.events(matching: predicate).compactMap { e in
  if e.isAllDay { return nil }
  if let me = e.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined { return nil }
  return [
    "title": e.title ?? "",
    "start": e.startDate.timeIntervalSince1970 * 1000,
    "end": e.endDate.timeIntervalSince1970 * 1000,
    "url": e.url?.absoluteString ?? "",
    "location": e.location ?? "",
    "notes": e.notes ?? "",
  ]
}
emit(["status": "ok", "events": events])
