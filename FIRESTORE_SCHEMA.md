# Firestore Data Model

This is a from-scratch Firestore design, not a 1:1 conversion of the MySQL schema. Two principles drove every decision below:

1. **Denormalize what's always read together.** Firestore has no JOINs. Anywhere the old SQL version would `JOIN` to show a name (e.g. an appointment list showing the doctor's name), the doctor's name is copied onto the appointment document itself at write time. This trades a small amount of write-time duplication (and the need to know it can go stale - see "Denormalization staleness" below) for read patterns that need exactly one document fetch instead of a join.
2. **Embed what's always read/written as a unit; keep separate what's queried independently.** Prescription line items, invoice line items, invoice payments, and lab results are always fetched alongside their one parent and never queried on their own - they're embedded as arrays/maps on the parent document, not separate collections. Patients, appointments, medical records, and lab *tests* are each independently queryable (filtered, paginated, sorted) by multiple different roles - those stay top-level collections.

## Collections

### `users/{uid}`
Document ID = the Firebase Auth UID. One document per login account, staff or patient.
```
role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'pharmacist' | 'lab_staff' | 'patient'
firstName, lastName, email, phone
isActive: boolean
createdAt, updatedAt: Timestamp
```
This is deliberately the *only* place "role" lives (see Security Rules doc - custom claims aren't usable without Cloud Functions, so Security Rules `get()` this document to authorize every request).

### `doctors/{uid}`
Document ID = the **same** UID as the linked `users/{uid}` doc - a true 1:1 profile extension, fetchable with a single direct read instead of a query.
```
firstName, lastName (denormalized from users/{uid})
departmentId, departmentName (denormalized)
specialization, qualification, licenseNumber, yearsOfExperience,
consultationFee, bio, roomNumber
createdAt, updatedAt
```
`firstName`/`lastName` are a deliberate exception to "don't duplicate `users` fields elsewhere" - every appointment, prescription, medical record, and lab test creation reads a doctor's name from *this* document specifically (not a second lookup against `users`), so the name needs to live here directly rather than requiring two reads every time a doctor is referenced anywhere in the app. Created automatically alongside the `users/{uid}` document whenever an admin registers a new account with `role: 'doctor'` (see `authService.register()`) - a doctor account is never left without a matching profile document, mirroring the old backend's `doctorModel.createMinimal()` step.

### `patients/{patientId}` (auto-ID)
Not keyed by UID, because most patients in a hospital system never get a portal login - `userId` is null until an admin/receptionist grants one.
```
patientCode, userId (nullable - links to users/{uid} once portal access exists)
firstName, lastName, dateOfBirth, gender, bloodGroup
phone, email, address, city
allergies, chronicConditions
emergencyContactName, emergencyContactPhone, emergencyContactRelation
insuranceProvider, insurancePolicyNumber
profileImageData (nullable, base64 - see file-upload note below)
registeredBy, registeredByName (denormalized)
isActive
createdAt, updatedAt
```

### `departments/{departmentId}` (auto-ID)
```
name, description
headDoctorId, headDoctorName (denormalized)
doctorCount (denormalized counter - see below)
isActive
createdAt, updatedAt
```
`doctorCount` is maintained explicitly: every write that changes a doctor's `departmentId` runs inside a Firestore transaction that also increments the new department's counter and decrements the old one's. Firestore has no `COUNT(*)` equivalent over a live collection query at read time cheaply, so this is the standard Firestore pattern for "how many X in this Y" - computed once at write time, read for free afterward.

### `doctorAvailability/{availabilityId}` (auto-ID)
```
doctorId, day_of_week (0-6), start_time, end_time ("HH:MM" strings), slot_minutes, is_active
```

### `slotLocks/{doctorId_scheduledAtISO}` (deterministic ID, not auto-ID)
```
appointmentId, doctorId, scheduledAt (ISO string), createdAt
```
**This collection exists purely to make double-booking prevention truly atomic**, and its need comes from a real constraint worth being precise about: the Firestore **client SDK's** `runTransaction()` can only read and write individual documents by direct reference inside the transaction callback - it cannot run a `where()` query inside a transaction the way the old server-side SQL transaction could ("find any overlapping appointment, then insert"). A plain query-then-write from the client would reopen the exact narrow race window that existed (and was already disclosed) in the original system.

The fix: the document ID is deterministic - `${doctorId}_${scheduledAt ISO string}` - so "does a lock for this exact doctor+slot already exist" is a single direct-reference read, which a transaction *can* do atomically. Booking a slot means claiming this lock and creating the appointment in the same transaction; if the lock already exists, the transaction throws and the booking is rejected with "slot no longer available." Cancelling an appointment deletes its lock, which is what "a cancelled appointment frees the slot" actually means at the data level now. This works because slots are always generated from a fixed, non-overlapping grid (see `doctorAvailability`, where overlapping windows for one doctor are already rejected at creation) - any two distinct valid slot times for the same doctor are guaranteed non-overlapping, so an exact-match lock on the requested `scheduledAt` is sufficient, not just a heuristic.

### `appointments/{appointmentId}` (auto-ID)
```
patientId, patientName (denormalized), patientUserId (denormalized, nullable)
doctorId, doctorName (denormalized)
departmentId, departmentName (denormalized)
scheduledAt: Timestamp
durationMinutes, reason, status, cancellationReason
bookedBy
createdAt, updatedAt
```
`patientUserId` is a second, deliberate denormalization beyond principle #1 above - it exists purely so Security Rules can check "does this appointment belong to the requesting patient" as a zero-extra-read field comparison (`resource.data.patientUserId == request.auth.uid`) instead of a `get()` lookup against the `patients` collection on every single read. The same field appears on `medicalRecords`, `prescriptions`, and `labTests` below for the identical reason - it's the standard Firestore pattern for cheap per-document ownership checks in Security Rules, and it's why patient portal reads stay fast and cheap on the free tier's daily read quota.
Booking runs a `runTransaction()` from the client SDK (no server needed - Firestore transactions execute against the database directly and are still ACID) that re-reads any appointments for that doctor overlapping the requested time and aborts if one exists, immediately before the write. This is the direct replacement for the old `hasConflict()` SQL check.

### `medicalRecords/{recordId}` (auto-ID)
```
patientId, patientName (denormalized), patientUserId (denormalized, nullable)
doctorId, doctorName (denormalized)
appointmentId
diagnosis, symptoms, treatmentPlan, doctorNotes, followUpDate
attachments: [{ fileName, fileType, fileData (base64), uploadedAt, uploadedBy }]
createdAt, updatedAt
```
Attachments are embedded (small ones only - see file-upload note) rather than a subcollection, since a record's attachments are always shown together with the record.

### `vitals/{vitalId}` (auto-ID)
```
patientId, appointmentId
recordedBy, recordedByName (denormalized)
temperatureCelsius, heartRateBpm, bloodPressureSystolic, bloodPressureDiastolic,
respiratoryRate, oxygenSaturation, weightKg, heightCm, notes
recordedAt
```

### `prescriptions/{prescriptionId}` (auto-ID)
```
patientId, patientName (denormalized), patientUserId (denormalized, nullable)
doctorId, doctorName (denormalized)
medicalRecordId, status, notes
items: [{ medicineId, medicineName (denormalized), dosage, frequency, durationDays,
          quantity, instructions, isDispensed, dispensedBy, dispensedAt }]
createdAt, updatedAt
```
Items are embedded - a prescription with its line items is always read and written as one unit, and there are never more than a handful of items. Dispensing one item updates that one array entry inside a transaction that also decrements `medicines/{id}.currentStock` and the relevant `medicineStock` batch(es) - the client-side replacement for the old server-side FIFO decrement.

### `medicines/{medicineId}` (auto-ID)
```
name, categoryId, categoryName (denormalized), genericName, manufacturer, unit,
unitPrice, reorderLevel, isActive
currentStock (denormalized running total - maintained by the same transactions
              that write to medicineStock, so "low stock" is a cheap single-field
              read instead of summing every batch on every page load)
createdAt, updatedAt
```

### `medicineCategories/{categoryId}` (auto-ID)
```
name
```

### `medicineStock/{stockId}` (auto-ID, top-level, `medicineId` field)
```
medicineId, medicineName (denormalized), batchNumber, quantity, expiryDate,
supplier, receivedAt, createdAt
```
Top-level (not a subcollection of `medicines`) so an admin can query "everything expiring in the next 30 days" across *all* medicines in one query, which a subcollection layout can't do without a collection-group query anyway - a top-level collection with a `medicineId` field is simpler and equally queryable either way here.

### `labTests/{testId}` (auto-ID)
```
patientId, patientName (denormalized), patientUserId (denormalized, nullable)
doctorId, doctorName (denormalized)
medicalRecordId, testName, testType, priority, status, notes
requestedAt
result: {                              <-- embedded, not a separate collection
  resultSummary, resultData (map),
  reportFileName, reportFileData (base64, nullable - see file-upload note),
  uploadedBy, uploadedByName (denormalized),
  reviewedBy, reviewedByName (denormalized), reviewedAt, uploadedAt
} | null
```
The old SQL schema split `laboratory_tests`/`laboratory_results` into two tables mostly because a result doesn't exist until the test completes. In Firestore, `result` is simply `null` until then and a map once it exists - one document, one read, no join, and no reason to keep them separate.

### `invoices/{invoiceId}` (auto-ID)
```
invoiceNumber, patientId, patientName (denormalized), appointmentId
subtotal, discount, tax, total, amountPaid, status, dueDate
createdBy, createdByName (denormalized)
items: [{ description, itemType, referenceId, quantity, unitPrice, lineTotal }]
payments: [{ amount, paymentMethod, referenceNumber, receivedBy,
             receivedByName (denormalized), paidAt }]
createdAt, updatedAt
```
Both line items and payment history are embedded for the same reason as prescription items - always read as a unit, never independently queried, and small in number.

### `notifications/{notificationId}` (auto-ID)
```
userId, type, title, message, isRead, referenceType, referenceId, createdAt
```

### `auditLogs/{logId}` (auto-ID)
```
userId, userName (denormalized), action, entityType, entityId, metadata (map), createdAt
```
**Important trust difference from the old system**, documented here rather than glossed over: in the MySQL/Express version, every mutation wrote its own audit log entry *server-side*, so the log was authoritative - a client literally could not perform an action without the corresponding entry being written by trusted code. With no server, the client itself writes this entry after each action. Security Rules constrain *who* can write here and require `userId == request.auth.uid` plus a plausible timestamp, but a sufficiently determined user calling the Firestore SDK directly (bypassing the UI) could in principle perform an action and skip logging it, or the reverse. This is a real, structural downgrade versus a server-enforced audit trail, not a cosmetic one - flagged clearly in the README's limitations section too.

There is no `reports` collection - the Reports module computes everything on demand from the collections above, in the browser (see the Reports migration note in the main README for why, and its scale limits).

## Denormalization staleness

Every `*Name` field above is a snapshot taken at write time. If a doctor's name is later corrected, every appointment/prescription/etc. that already denormalized their old name keeps showing it until that specific record is next touched. The old SQL system never had this problem (a `JOIN` always reads the current name). This is the standard, accepted Firestore tradeoff for avoiding N+1 reads on every list view - acceptable here because names change rarely and the records in question are historical anyway (an appointment from six months ago showing a doctor's name *as it was* isn't really wrong). Where it would matter more, the field is documented as denormalized so a future targeted backfill is possible.

## File uploads (patient photos, medical record attachments, lab report files)

Firebase Storage requires the Blaze plan as of February 2026 - there is no free-tier path to it anymore. The implementation in this migration:
- Small images (patient profile photos, ≤500KB after client-side compression) are stored as base64 strings directly on the document (`profileImageData` etc.), which works within Firestore's 1 MiB per-document limit but eats into your 1 GiB free storage quota fast if used heavily.
- Larger files (lab report PDFs, multi-page attachments) are **not uploaded** in this version - the UI accepts structured result data and a summary instead of a file, and clearly labels file attachment as unavailable rather than silently failing. If you need real file storage later, the safest free-tier-compatible option is a separate free service (e.g. Cloudinary's free tier) called directly from the browser - deliberately not wired up here, since that would be introducing a new third-party paid-adjacent service without your explicit go-ahead.
