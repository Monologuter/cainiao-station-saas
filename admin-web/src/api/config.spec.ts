import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  channelConfigsApi,
  createDictItemApi,
  createNotifyTemplateApi,
  dictionariesApi,
  dictItemsApi,
  notifyTemplatesApi,
  systemConfigsApi,
  updateChannelConfigApi,
  updateDictItemApi,
  updateNotifyTemplateApi,
  updateSystemConfigApi,
} from "./config";

describe("admin config api", () => {
  it("maps system dictionary channel and template endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue([]);
    const post = vi.spyOn(http, "post").mockResolvedValue({});
    const patch = vi.spyOn(http, "patch").mockResolvedValue({});

    await systemConfigsApi();
    await updateSystemConfigApi("notify.sms.daily_limit", 6000);
    await dictionariesApi();
    await dictItemsApi("exception_type");
    await createDictItemApi("exception_type", { code: "DAMAGED" });
    await updateDictItemApi("item-1", { enabled: false });
    await channelConfigsApi();
    await updateChannelConfigApi("sms", { provider: "mock" });
    await notifyTemplatesApi({ code: "PARCEL_STORED" });
    await createNotifyTemplateApi({ code: "QA", channel: "SMS" });
    await updateNotifyTemplateApi("tpl-1", { enabled: false });

    expect(get).toHaveBeenCalledWith("/admin/config/system");
    expect(patch).toHaveBeenCalledWith(
      "/admin/config/system/notify.sms.daily_limit",
      { value: 6000 },
    );
    expect(get).toHaveBeenCalledWith("/admin/config/dictionaries");
    expect(get).toHaveBeenCalledWith(
      "/admin/config/dictionaries/exception_type/items",
    );
    expect(post).toHaveBeenCalledWith(
      "/admin/config/dictionaries/exception_type/items",
      { code: "DAMAGED" },
    );
    expect(patch).toHaveBeenCalledWith("/admin/config/dict-items/item-1", {
      enabled: false,
    });
    expect(get).toHaveBeenCalledWith("/admin/config/channels");
    expect(patch).toHaveBeenCalledWith("/admin/config/channels/sms", {
      provider: "mock",
    });
    expect(get).toHaveBeenCalledWith("/admin/config/notify-templates", {
      params: { code: "PARCEL_STORED" },
    });
    expect(post).toHaveBeenCalledWith("/admin/config/notify-templates", {
      code: "QA",
      channel: "SMS",
    });
    expect(patch).toHaveBeenCalledWith(
      "/admin/config/notify-templates/tpl-1",
      { enabled: false },
    );
  });
});
