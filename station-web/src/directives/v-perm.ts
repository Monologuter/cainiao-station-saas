import type { App, Directive, DirectiveBinding } from 'vue';
import { useAuthStore } from '@/stores/auth';

export type PermValue = string | string[];

export function canUsePerm(perms: string[], required: PermValue | undefined) {
  if (!required) {
    return true;
  }
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.some((code) => perms.includes(code));
}

function applyPermission(el: HTMLElement, binding: DirectiveBinding<PermValue>) {
  const auth = useAuthStore();
  if (canUsePerm(auth.perms, binding.value)) {
    return;
  }

  if (binding.modifiers.disable) {
    el.setAttribute('disabled', 'true');
    el.setAttribute('aria-disabled', 'true');
    el.classList.add('is-perm-disabled');
    return;
  }

  el.parentNode?.removeChild(el);
}

export const vPerm: Directive<HTMLElement, PermValue> = {
  mounted: applyPermission,
  updated: applyPermission,
};

export function installPermDirective(app: App) {
  app.directive('perm', vPerm);
}
