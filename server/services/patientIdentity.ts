import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type PatientIdentityInput = { firstName: string; lastName: string; email?: string | null; dateOfBirth?: Date | null };

const key = () => createHash("sha256").update(process.env.JWT_SECRET || "aegis-development-key").digest();
const normalise = (value: string | null | undefined) => (value || "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

export function patientIdentityHash(input: PatientIdentityInput) {
  return createHash("sha256").update([normalise(input.firstName), normalise(input.lastName), normalise(input.email), input.dateOfBirth?.toISOString().slice(0, 10) || ""].join("|"), "utf8").digest("hex");
}

export function encryptPatientValue(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptPatientValue(ciphertext: string) {
  const packed = Buffer.from(ciphertext, "base64url"); const decipher = createDecipheriv("aes-256-gcm", key(), packed.subarray(0, 12)); decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
}

export function encryptPatientIdentity(input: PatientIdentityInput) {
  return { identityHash: patientIdentityHash(input), firstNameCiphertext: encryptPatientValue(input.firstName.trim()), lastNameCiphertext: encryptPatientValue(input.lastName.trim()), emailCiphertext: input.email?.trim() ? encryptPatientValue(input.email.trim()) : null, dateOfBirthCiphertext: input.dateOfBirth ? encryptPatientValue(input.dateOfBirth.toISOString().slice(0, 10)) : null };
}

export function createPatientSigningToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPatientSigningToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
