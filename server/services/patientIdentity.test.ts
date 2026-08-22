import { describe, expect, it } from "vitest";
import { decryptPatientValue, encryptPatientIdentity, patientIdentityHash } from "./patientIdentity";

describe("encrypted patient identity", () => {
  it("stores readable identity values as ciphertext while preserving a clinic-deduplication hash", () => {
    const identity = encryptPatientIdentity({ firstName: "Synthetic", lastName: "Patient", email: "synthetic@example.test", dateOfBirth: new Date("1990-01-02T00:00:00.000Z") });
    expect(identity.firstNameCiphertext).not.toContain("Synthetic"); expect(identity.lastNameCiphertext).not.toContain("Patient"); expect(decryptPatientValue(identity.firstNameCiphertext)).toBe("Synthetic"); expect(decryptPatientValue(identity.lastNameCiphertext)).toBe("Patient");
    expect(identity.identityHash).toBe(patientIdentityHash({ firstName: " synthetic ", lastName: "PATIENT", email: "SYNTHETIC@example.test", dateOfBirth: new Date("1990-01-02T00:00:00.000Z") }));
  });
});
