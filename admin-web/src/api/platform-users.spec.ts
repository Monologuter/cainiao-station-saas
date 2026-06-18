import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  createPlatformUserApi,
  deactivatePlatformUserApi,
  platformUsersApi,
  updatePlatformUserApi,
} from "./platform-users";

describe("admin platform users api", () => {
  it("maps platform user CRUD endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({ list: [], total: 0 });
    const post = vi.spyOn(http, "post").mockResolvedValue({});
    const patch = vi.spyOn(http, "patch").mockResolvedValue({});
    const del = vi.spyOn(http, "delete").mockResolvedValue({});

    await platformUsersApi();
    await createPlatformUserApi({
      username: "ops",
      password: "pw123456",
      roleCodes: ["运营"],
    });
    await updatePlatformUserApi("u1", { status: "inactive" });
    await deactivatePlatformUserApi("u1");

    expect(get).toHaveBeenCalledWith("/admin/platform-users");
    expect(post).toHaveBeenCalledWith("/admin/platform-users", {
      username: "ops",
      password: "pw123456",
      roleCodes: ["运营"],
    });
    expect(patch).toHaveBeenCalledWith("/admin/platform-users/u1", {
      status: "inactive",
    });
    expect(del).toHaveBeenCalledWith("/admin/platform-users/u1");
  });
});
