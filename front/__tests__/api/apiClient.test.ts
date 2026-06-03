import { apiClient } from "../../api/apiClient";

describe("apiClient", () => {
  beforeAll(() => {
    jest.mock("@sentry/react-native", () => ({
      init: jest.fn(),
      captureMessage: jest.fn(),
      captureException: jest.fn(),
    }));
  });

  it("should use XMLHttpRequest for FormData (bypassing fetch polyfills)", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: jest.fn().mockResolvedValue('{"success": true}'),
    });
    global.fetch = mockFetch;

    // Mock XMLHttpRequest
    const mockXhr = {
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      send: jest.fn(),
      onload: null as any,
      onerror: null as any,
      status: 200,
      responseText: '{"success": true}',
    };
    const XMLHttpRequestMock = jest.fn().mockImplementation(() => mockXhr);
    (global as any).XMLHttpRequest = XMLHttpRequestMock;

    const formData = new FormData();
    (formData as any)._parts = [
      ["message", "hello"],
      ["image", { uri: "file://test.jpg", name: "test.jpg", type: "image/jpeg" }],
    ];

    const promise = apiClient("/test", { method: "POST", body: formData });

    // Simulate XHR success
    setTimeout(() => {
      mockXhr.onload?.();
    }, 0);

    const result = await promise;

    // Should have used XHR, NOT fetch
    expect(mockFetch).not.toHaveBeenCalled();
    expect(XMLHttpRequestMock).toHaveBeenCalled();
    expect(mockXhr.open).toHaveBeenCalledWith("POST", expect.stringContaining("/test"));
    expect(mockXhr.send).toHaveBeenCalledWith(formData);

    // Content-Type should NOT be set (let XHR set it automatically for FormData)
    expect(mockXhr.setRequestHeader).not.toHaveBeenCalledWith(
      "Content-Type",
      expect.anything()
    );
    expect(mockXhr.setRequestHeader).toHaveBeenCalledWith(
      "Authorization",
      expect.any(String)
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ success: true });
  });

  it("should set Content-Type to application/json for regular JSON requests", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: jest.fn().mockResolvedValue('{"success": true}'),
    });
    global.fetch = mockFetch;

    await apiClient("/test", { method: "POST", body: JSON.stringify({ message: "hello" }) });

    const requestInit = mockFetch.mock.calls[0][1];
    expect(requestInit.headers["Content-Type"]).toBe("application/json");
  });

  it("reproduces: Expo winter/fetch cannot handle RN {uri,name,type} FormData parts", () => {
    const imagePart = {
      uri: "file:///var/mobile/Containers/Data/Application/test.jpg",
      name: "image.jpg",
      type: "image/jpeg",
    };

    const isString = typeof imagePart === "string";
    const isBlob = imagePart instanceof Blob;
    const hasBytesMethod =
      typeof imagePart === "object" &&
      imagePart !== null &&
      "bytes" in imagePart &&
      typeof (imagePart as any).bytes === "function";

    expect({
      isString,
      isBlob,
      hasBytesMethod,
      supported: isString || isBlob || hasBytesMethod,
    }).toEqual({
      isString: false,
      isBlob: false,
      hasBytesMethod: false,
      supported: false,
    });
  });
});
