import { createHash } from "node:crypto";
import { AccountId, Client, PrivateKey, TopicId, TopicMessageSubmitTransaction } from "@hashgraph/sdk";

export type HederaNotaryReference = {
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
  consensusTimestamp: string | null;
};

type NotaryAttempt = { status: "notarized"; reference: HederaNotaryReference } | { status: "notary_pending"; error: string };

const mirrorNodeUrl = () => (process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com").replace(/\/$/, "");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function calculateSnapshotHash(snapshot: unknown) {
  return digest(snapshot);
}

export function buildWithdrawalEventHash(input: { previousEventHash: string | null; consentRecordId: number; snapshotHash: string; reason: string; occurredAt: Date; actorUserId: number }) {
  return digest({ version: 1, previousEventHash: input.previousEventHash, consentRecordId: input.consentRecordId, snapshotHash: input.snapshotHash, reason: input.reason, occurredAt: input.occurredAt.toISOString(), actorUserId: input.actorUserId });
}

export async function notarizeSnapshotHash(input: { topicId: string | null | undefined; snapshotHash: string }) : Promise<NotaryAttempt> {
  const operatorId = process.env.HEDERA_OPERATOR_ID; const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!input.topicId) return { status: "notary_pending", error: "No per-clinic Hedera testnet topic is configured" };
  if (!operatorId || !operatorKey) return { status: "notary_pending", error: "Hedera operator credentials are not configured in the deployment environment" };
  try {
    const client = Client.forTestnet(); client.setOperator(AccountId.fromString(operatorId), PrivateKey.fromString(operatorKey));
    const response = await new TopicMessageSubmitTransaction().setTopicId(TopicId.fromString(input.topicId)).setMessage(JSON.stringify({ version: 1, snapshotHash: input.snapshotHash })).execute(client);
    const [receipt, record] = await Promise.all([response.getReceipt(client), response.getRecord(client)]);
    const sequenceNumber = receipt.topicSequenceNumber?.toString();
    if (!sequenceNumber) return { status: "notary_pending", error: "Hedera did not return a Consensus Service sequence number" };
    return { status: "notarized", reference: { topicId: input.topicId, sequenceNumber, transactionId: response.transactionId.toString(), consensusTimestamp: record.consensusTimestamp?.toString() || null } };
  } catch (error) {
    return { status: "notary_pending", error: error instanceof Error ? error.message.slice(0, 1000) : "Hedera notarization could not be completed" };
  }
}

export async function verifyNotarizedSnapshot(input: { signedSnapshot: unknown; snapshotHash: string | null; topicId: string | null; sequenceNumber: string | null }) {
  if (!input.signedSnapshot || !input.snapshotHash || !input.topicId || !input.sequenceNumber) return { status: "unknown" as const, message: "No completed Hedera notarization reference is recorded" };
  if (calculateSnapshotHash(input.signedSnapshot) !== input.snapshotHash) return { status: "modified" as const, message: "The stored signed snapshot no longer matches its sealed hash" };
  try {
    const response = await fetch(`${mirrorNodeUrl()}/api/v1/topics/${encodeURIComponent(input.topicId)}/messages?sequencenumber=${encodeURIComponent(input.sequenceNumber)}`);
    if (!response.ok) return { status: "unknown" as const, message: `Hedera Mirror Node returned HTTP ${response.status}` };
    const body = await response.json() as { messages?: Array<{ message?: string; sequence_number?: number }> };
    const message = body.messages?.find(item => String(item.sequence_number) === input.sequenceNumber);
    if (!message?.message) return { status: "unknown" as const, message: "The notarized Hedera message is not yet available from Mirror Node" };
    const payload = JSON.parse(Buffer.from(message.message, "base64").toString("utf8")) as { snapshotHash?: string };
    if (payload.snapshotHash !== input.snapshotHash) return { status: "modified" as const, message: "The Hedera message does not match the sealed snapshot hash" };
    return { status: "certified" as const, message: "The signed snapshot hash matches the Hedera Consensus Service message" };
  } catch (error) {
    return { status: "unknown" as const, message: error instanceof Error ? error.message.slice(0, 1000) : "Hedera Mirror Node verification failed" };
  }
}
