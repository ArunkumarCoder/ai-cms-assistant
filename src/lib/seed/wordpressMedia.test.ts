import { describe, expect, it, vi } from "vitest";
import { attachMediaToPost, findOrUploadDemoMedia } from "./wordpressMedia";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("findOrUploadDemoMedia", () => {
  it("reuses an existing attachment id when the search finds one, never uploads", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 42 }]),
    });

    const id = await findOrUploadDemoMedia({
      baseUrl: "http://localhost:8890",
      authHeader: "Basic abc",
      title: "Demo: Roast Bag Hero",
      filename: "demo-roast.png",
      pngBuffer: PNG,
      fetchImpl,
    });

    expect(id).toBe("42");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // search only, no POST upload
  });

  it("uploads a new attachment when the search finds nothing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 99 }),
      });

    const id = await findOrUploadDemoMedia({
      baseUrl: "http://localhost:8890",
      authHeader: "Basic abc",
      title: "Demo: Roast Bag Hero",
      filename: "demo-roast.png",
      pngBuffer: PNG,
      fetchImpl,
    });

    expect(id).toBe("99");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, uploadInit] = fetchImpl.mock.calls[1];
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.body).toBeInstanceOf(FormData);
  });

  it("throws a clear error when the search request itself fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(
      findOrUploadDemoMedia({
        baseUrl: "http://localhost:8890",
        authHeader: "Basic abc",
        title: "Demo: Roast Bag Hero",
        filename: "demo-roast.png",
        pngBuffer: PNG,
        fetchImpl,
      }),
    ).rejects.toThrow("401");
  });

  it("throws a clear error when the upload request itself fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      findOrUploadDemoMedia({
        baseUrl: "http://localhost:8890",
        authHeader: "Basic abc",
        title: "Demo: Roast Bag Hero",
        filename: "demo-roast.png",
        pngBuffer: PNG,
        fetchImpl,
      }),
    ).rejects.toThrow("500");
  });
});

describe("attachMediaToPost", () => {
  it("POSTs the numeric post id to the media attachment's own endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await attachMediaToPost(
      "http://localhost:8890",
      "Basic abc",
      "31",
      "107",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/wp-json/wp/v2/media/31");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ post: 107 });
  });

  it("throws a clear error when the request fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(
      attachMediaToPost(
        "http://localhost:8890",
        "Basic abc",
        "31",
        "107",
        fetchImpl,
      ),
    ).rejects.toThrow("403");
  });
});
