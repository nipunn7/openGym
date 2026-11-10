import Foundation
import Capacitor
import HealthKit

/// Read-only bridge to Apple Health for the trainer's morning check-in and walk tracking.
///
/// `readDay` returns what is known about today, in plain numbers:
///   sleepHours   – time asleep since 18:00 yesterday, overlapping samples from the Watch and
///                  the iPhone merged so a night is never counted twice
///   rhr          – latest resting heart rate in the last 36 h (bpm)
///   hrv          – latest heart-rate variability (SDNN) in the last 36 h (ms)
///   weightKg     – latest body mass recorded today
///   steps        – steps since midnight
///   walkMinutes  – walking/hiking workouts since midnight (e.g. an Apple Watch "Outdoor Walk")
/// Keys are left out when Health has nothing for them (or the user didn't grant that type).
@objc(TrainerHealthPlugin)
public class TrainerHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrainerHealthPlugin"
    public let jsName = "TrainerHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDay", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        let quantities: [HKQuantityTypeIdentifier] = [.restingHeartRate, .heartRateVariabilitySDNN, .bodyMass, .stepCount]
        for id in quantities {
            if let type = HKObjectType.quantityType(forIdentifier: id) { types.insert(type) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        types.insert(HKObjectType.workoutType())
        return types
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            // iOS never tells an app which read types were granted; `success` only means the
            // sheet was shown and answered.
            call.resolve(["granted": success])
        }
    }

    @objc func readDay(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        let lock = NSLock()
        var out: [String: Any] = [:]
        func put(_ key: String, _ value: Any) {
            lock.lock(); out[key] = value; lock.unlock()
        }

        let now = Date()
        let calendar = Calendar.current
        let midnight = calendar.startOfDay(for: now)
        let recent = now.addingTimeInterval(-36 * 3600)

        // Latest single sample of a quantity type since `since`.
        func latest(_ id: HKQuantityTypeIdentifier, unit: HKUnit, since: Date, key: String) {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let predicate = HKQuery.predicateForSamples(withStart: since, end: now, options: [])
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                if let sample = samples?.first as? HKQuantitySample {
                    put(key, sample.quantity.doubleValue(for: unit))
                }
                group.leave()
            }
            store.execute(query)
        }

        latest(.restingHeartRate, unit: HKUnit.count().unitDivided(by: HKUnit.minute()), since: recent, key: "rhr")
        latest(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli), since: recent, key: "hrv")
        latest(.bodyMass, unit: HKUnit.gramUnit(with: .kilo), since: midnight, key: "weightKg")

        // Sleep: union of every "asleep" interval since 18:00 yesterday. Raw values are used so
        // this works on iOS 14 too: 1 = asleep / asleepUnspecified, 3 = core, 4 = deep, 5 = REM
        // (0 = in bed and 2 = awake are not sleep).
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let from = midnight.addingTimeInterval(-6 * 3600)
            let predicate = HKQuery.predicateForSamples(withStart: from, end: now, options: [])
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                let asleepValues: Set<Int> = [1, 3, 4, 5]
                let intervals = (samples as? [HKCategorySample] ?? [])
                    .filter { asleepValues.contains($0.value) }
                    .map { (start: $0.startDate, end: $0.endDate) }
                    .sorted { $0.start < $1.start }
                var total: TimeInterval = 0
                var current: (start: Date, end: Date)? = nil
                for interval in intervals {
                    if let c = current, interval.start <= c.end {
                        current = (start: c.start, end: max(c.end, interval.end))
                    } else {
                        if let c = current { total += c.end.timeIntervalSince(c.start) }
                        current = interval
                    }
                }
                if let c = current { total += c.end.timeIntervalSince(c.start) }
                if total > 0 { put("sleepHours", total / 3600) }
                group.leave()
            }
            store.execute(query)
        }

        // Steps since midnight (HealthKit de-duplicates iPhone + Watch in statistics queries).
        if let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) {
            group.enter()
            let predicate = HKQuery.predicateForSamples(withStart: midnight, end: now, options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                if let sum = stats?.sumQuantity() {
                    put("steps", sum.doubleValue(for: HKUnit.count()))
                }
                group.leave()
            }
            store.execute(query)
        }

        // Walking and hiking workouts since midnight.
        group.enter()
        let workoutPredicate = HKQuery.predicateForSamples(withStart: midnight, end: now, options: [])
        let workoutQuery = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: workoutPredicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
            let walks = (samples as? [HKWorkout] ?? []).filter {
                $0.workoutActivityType == .walking || $0.workoutActivityType == .hiking
            }
            if !walks.isEmpty {
                put("walkMinutes", walks.reduce(0.0) { $0 + $1.duration / 60 })
            }
            group.leave()
        }
        store.execute(workoutQuery)

        group.notify(queue: .main) {
            call.resolve(out)
        }
    }
}
