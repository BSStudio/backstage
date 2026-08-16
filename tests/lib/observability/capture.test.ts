import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
}));

import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  captureServiceError,
  captureSyncJobFailure,
} from "@/lib/observability/capture";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("captureSyncJobFailure", () => {
  it("tags the member and the external system, and never the payload", () => {
    const error = new Error("Drupal rejected the form");

    captureSyncJobFailure(error, {
      jobId: "job-1",
      memberId: "uuid-member-1",
      target: "WEBSITE",
      operation: "CREATE_USER",
      attempts: 2,
    });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: {
        "sync.job_id": "job-1",
        "sync.target": "WEBSITE",
        "sync.operation": "CREATE_USER",
        "member.id": "uuid-member-1",
      },
      extra: { attempts: 2 },
    });
  });
});

describe("captureServiceError", () => {
  it("reports unexpected errors", () => {
    const error = new Error("Authentik 502");
    captureServiceError(error);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("ignores typed errors — they are control flow, not incidents", () => {
    captureServiceError(new NotFoundError());
    captureServiceError(new ValidationError({ email: "kell" }));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
