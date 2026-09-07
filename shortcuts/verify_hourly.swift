// Verify actual serialized dates with the same date library used by Shortcuts.
// Input: JSON array of 24 ISO-8601 UTC date strings, ordered by local hour.
import Foundation

let data = FileHandle.standardInput.readDataToEndOfFile()
let dates = try JSONDecoder().decode([String].self, from: data)
precondition(dates.count == 24)
let formatter = ISO8601DateFormatter()
var calendar = Calendar(identifier: .gregorian)
calendar.timeZone = TimeZone(identifier: "Pacific/Honolulu")!
for (hour, value) in dates.enumerated() {
    let date = formatter.date(from: value)!
    let local = calendar.dateComponents([.hour, .minute, .second], from: date)
    precondition(local.hour == hour && local.minute == 0 && local.second == 0,
                 "Incorrect Honolulu time: \(value) -> \(local)")
}
print("Foundation verified all 24 Honolulu hours at :00:00.")
