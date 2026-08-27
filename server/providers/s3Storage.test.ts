import { describe, expect, it } from "vitest";
import { buildS3Client, s3PresignGet, s3PresignPut, type S3Config } from "./s3Storage";

// No network is touched: presigning is pure local SigV4 computation.
const minioConfig: S3Config = {
  endpoint: "http://127.0.0.1:9000",
  bucket: "aegis-test",
  accessKey: "test-access-key",
  secretKey: "test-secret-key",
  region: "us-east-1",
};

describe("s3 presign shape (STORAGE_PROVIDER=s3)", () => {
  it("presigned PUT is path-style against the custom endpoint with SigV4 params", async () => {
    const url = new URL(
      await s3PresignPut("consents/1/signature_abc.png", "image/png", minioConfig)
    );
    // Path-style (MinIO requirement): bucket in the path, host is the endpoint.
    expect(url.host).toBe("127.0.0.1:9000");
    expect(url.pathname).toBe("/aegis-test/consents/1/signature_abc.png");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain("test-access-key");
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeGreaterThan(0);
  });

  it("presigned GET carries the same shape for downloads", async () => {
    const url = new URL(
      await s3PresignGet("clinics/1/supplier-evidence/2/doc.pdf", minioConfig)
    );
    expect(url.host).toBe("127.0.0.1:9000");
    expect(url.pathname).toBe("/aegis-test/clinics/1/supplier-evidence/2/doc.pdf");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PUT and GET presigns differ (method is part of the signature)", async () => {
    const put = await s3PresignPut("k.txt", "text/plain", minioConfig);
    const get = await s3PresignGet("k.txt", minioConfig);
    expect(new URL(put).searchParams.get("X-Amz-Signature")).not.toBe(
      new URL(get).searchParams.get("X-Amz-Signature")
    );
  });

  it("client caches by config and honors forcePathStyle only with an endpoint", async () => {
    const a = buildS3Client(minioConfig);
    const b = buildS3Client({ ...minioConfig });
    expect(a).toBe(b);
    const aws = buildS3Client({ ...minioConfig, endpoint: "" });
    expect(aws).not.toBe(a);
    // Without a custom endpoint the URL is virtual-hosted AWS style.
    const url = new URL(
      await s3PresignGet("k.txt", { ...minioConfig, endpoint: "" })
    );
    expect(url.host).toBe("aegis-test.s3.us-east-1.amazonaws.com");
  });
});
