import { ok, fail } from "../../src/utils/response";

function mockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("ok", () => {
  it("returns success envelope with data", () => {
    const res = mockResponse();
    ok(res, { id: 1, name: "Alice" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 1, name: "Alice" },
      error: null,
    });
  });

  it("uses default status 200", () => {
    const res = mockResponse();
    ok(res, "hello");

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("accepts a custom status code", () => {
    const res = mockResponse();
    ok(res, { created: true }, 201);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { created: true },
      error: null,
    });
  });

  it("handles null data", () => {
    const res = mockResponse();
    ok(res, null);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: null,
      error: null,
    });
  });

  it("handles array data", () => {
    const res = mockResponse();
    ok(res, [1, 2, 3]);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [1, 2, 3],
      error: null,
    });
  });
});

describe("fail", () => {
  it("returns error envelope with code and message", () => {
    const res = mockResponse();
    fail(res, "not_found", "Resource not found");

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: { code: "not_found", message: "Resource not found" },
    });
  });

  it("uses default status 400", () => {
    const res = mockResponse();
    fail(res, "bad_request", "Invalid input");

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("accepts a custom status code", () => {
    const res = mockResponse();
    fail(res, "unauthorized", "Not authorized", 401);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: { code: "unauthorized", message: "Not authorized" },
    });
  });

  it("includes optional details when provided", () => {
    const res = mockResponse();
    const details = { field: "email", reason: "invalid format" };
    fail(res, "validation_error", "Validation failed", 422, details);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: {
        code: "validation_error",
        message: "Validation failed",
        details: { field: "email", reason: "invalid format" },
      },
    });
  });

  it("omits details key when not provided", () => {
    const res = mockResponse();
    fail(res, "error", "Something went wrong");

    const payload = res.json.mock.calls[0][0];
    expect(payload.error).not.toHaveProperty("details");
  });

  it("accepts a 500 status for server errors", () => {
    const res = mockResponse();
    fail(res, "server_error", "Internal server error", 500);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("accepts details as undefined explicitly (no details key)", () => {
    const res = mockResponse();
    fail(res, "error", "msg", 400, undefined);

    const payload = res.json.mock.calls[0][0];
    expect(payload.error).not.toHaveProperty("details");
  });

  it("accepts details as null (includes details key)", () => {
    const res = mockResponse();
    fail(res, "error", "msg", 400, null);

    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toHaveProperty("details");
    expect(payload.error.details).toBeNull();
  });
});
