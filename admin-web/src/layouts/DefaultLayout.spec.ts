import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DefaultLayout from "./DefaultLayout.vue";
import { useAuthStore } from "@/stores/auth";

const route = reactive({
  name: "tenants",
  meta: { title: "租户管理", sub: "租户生命周期" },
});
const push = vi.fn();
const replace = vi.fn();

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}));

function mountLayout() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = {
    id: "admin-1",
    username: "admin",
    tenantId: null,
    roles: ["PLATFORM_SUPER_ADMIN"],
    perms: [],
    stations: [],
    isPlatform: true,
  };

  return mount(DefaultLayout, {
    global: {
      plugins: [pinia],
      stubs: {
        "router-view": { template: '<main data-testid="route-outlet" />' },
      },
    },
  });
}

describe("admin default layout notifications", () => {
  beforeEach(() => {
    route.name = "tenants";
    route.meta = { title: "租户管理", sub: "租户生命周期" };
    push.mockReset();
    replace.mockReset();
    localStorage.clear();
  });

  it("opens admin notices, marks them read, and navigates from an item", async () => {
    const wrapper = mountLayout();

    expect(wrapper.find('[data-testid="notice-panel"]').exists()).toBe(false);
    expect(wrapper.find(".ibtn .dot").exists()).toBe(true);

    await wrapper.get('button[aria-label="通知"]').trigger("click");

    expect(wrapper.get('[data-testid="notice-panel"]').text()).toContain("站内消息");
    expect(wrapper.get('[data-testid="notice-panel"]').text()).toContain("入驻申请待审核");

    await wrapper.get(".notice-item").trigger("click");

    expect(push).toHaveBeenCalledWith({ name: "applications" });
    expect(wrapper.find('[data-testid="notice-panel"]').exists()).toBe(false);
    expect(wrapper.find(".ibtn .dot").exists()).toBe(false);
  });

  it("submits the global tenant search keyword", async () => {
    const wrapper = mountLayout();

    await wrapper.get('[data-testid="global-search-input"]').setValue("城南");
    await wrapper.get('[data-testid="global-search-input"]').trigger("keydown.enter");

    expect(push).toHaveBeenCalledWith({ name: "tenants", query: { keyword: "城南" } });
  });

  it("keeps the top identity chip separate from logout", async () => {
    const wrapper = mountLayout();

    expect(wrapper.get(".identity-chip").text()).toContain("admin");

    await wrapper.get(".identity-chip").trigger("click");

    expect(replace).not.toHaveBeenCalled();
  });
});
